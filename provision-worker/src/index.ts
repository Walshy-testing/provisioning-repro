import { DurableObject } from "cloudflare:workers";

const CUSTOMER_ACCOUNT = 'def6fe826ef8b60d212d46c7bb39e14f';
const MAIN_LTZ_ZONE = '28d39450da51357128e80d2217cba2f5';
const ltzZoneName = 'create-test.test.walshy.dev';

const exampleScript = `
export default {
	fetch() {
		return new Response('Hello, World!');
	}
}
`;

interface CustomerData {
	accountTag: string;
	zoneTag: string;
	workerUrl: string;
}

export class ProvisioningTest extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async setupNewCustomer(name: string): Promise<CustomerData> {
		// Create new zone  - https://developers.cloudflare.com/api/resources/zones/methods/create/
		const customerZone = await this.cfFetch<Zone>('/zones', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				account: {
					id: CUSTOMER_ACCOUNT,
				},
				name: `${name}.${ltzZoneName}`,
			}),
		});
		console.log(`Created zone ${customerZone.name} (${customerZone.id}) - nameservers: ${customerZone.name_servers.join(', ')}`);

		if (customerZone.name_servers.length !== 2) {
			throw new Error(`Sanity check error! New zone does not expect 2 nameservers. Nameservers: ${customerZone.name_servers.join(', ')}`);
		}

		// Setup NS DNS records for new LTZ - https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/
		await this.cfFetch(`/zones/${MAIN_LTZ_ZONE}/dns_records/batch`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				posts: [
					{
						content: customerZone.name_servers[0],
						name: `${name}`,
						tags: ['ltz', 'customer_test'],
						type: 'NS',
					},
					{
						content: customerZone.name_servers[1],
						name: `${name}`,
						tags: ['ltz', 'customer_test'],
						type: 'NS',
					},
				]
			})
		});
		console.log(`Setup NS DNS records for new LTZ: ${customerZone.name}`);

		// Setup DNS records on the new zone
		await this.cfFetch(`/zones/${customerZone.id}/dns_records/batch`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				posts: [
					{
						content: `100::`,
						name: `@`,
						proxied: true,
						comment: 'customer_test',
						type: 'AAAA',
					},
					{
						content: '100::',
						name: `*`,
						proxied: true,
						comment: 'customer_test',
						type: 'AAAA',
					},
				]
			})
		});
		console.log(`Setup DNS records on new LTZ`);

		// Deploy Worker
		const formData = new FormData();
		formData.append('script.js', new File([exampleScript], 'script.js', { type: 'application/javascript+module' }));
		formData.append('metadata', JSON.stringify({
			main_module: 'script.js',
			compatibility_date: new Date().toISOString().substring(0, 10),
		}));
		const workerUpload = await this.cfFetch(`/accounts/${CUSTOMER_ACCOUNT}/workers/scripts/${name}-worker`, {
			method: 'PUT',
			body: formData,
		});
		console.log(`Uploaded Worker`, JSON.stringify(workerUpload));

		// Setup custom domain
		await this.cfFetch(`/accounts/${CUSTOMER_ACCOUNT}/workers/domains`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				hostname: `worker.${customerZone.name}`,
				zone_id: customerZone.id,
				service: `${name}-worker`,
			}),
		});

		return {
			accountTag: CUSTOMER_ACCOUNT,
			zoneTag: customerZone.id,
			workerUrl: `worker.${customerZone.name}`,
		}
	}

	async cfFetch<T = unknown | null>(path: string, reqInit?: RequestInit) {
		return fetch(`https://api.cloudflare.com/client/v4${path}`, {
			...reqInit,
			headers: {
				...reqInit?.headers,
				Authorization: `Bearer ${this.env.API_TOKEN}`,
			}
		})
			.then((res) => res.json() as Promise<V4Response<T>>)
			.then((res) => {
				if (!res.success) {
					throw new Error(`Call to ${path} failed - ${JSON.stringify(res.errors, null, 2)}`);
				}
				return res.result;
			});
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname } = new URL(request.url);

		if (request.headers.get('x-walshy') === null) {
			return new Response('no', { status: 401 });
		}

		const customerId = pathname.slice(1);
		if (customerId === '' || customerId.length < 6) {
			return new Response('Invalid customer name', { status: 400 });
		}

		const id: DurableObjectId = env.PROVISION_DO.idFromName(customerId);
		const stub = env.PROVISION_DO.get(id);

		const preSetup = Date.now();
		let customerData: CustomerData;
		try {
			customerData = await stub.setupNewCustomer(customerId);
			console.log('Setup customer. Data: ' + JSON.stringify(customerData));
		} catch(e) {
			return new Response(`Failed to setup customer: ${(e as Error).message}\n${(e as Error).stack}`);
		}
		const postSetup = Date.now();

		const preHc = Date.now();
		let probeData: { probeAttempts: number };
		try {
			console.log(`Starting healtcheck probe to ${customerData.workerUrl}`);
			probeData = await env.HEALTHCHECK_PROBER.startHealthcheck(customerId, customerData.workerUrl);
			console.log('Probe returned success!');
		} catch(e) {
			return new Response(`Failed to check health of the customer: ${(e as Error).message}\n${(e as Error).stack}`);
		}
		const postHc = Date.now();

		console.log('Customer setup successfully!\n'
			+ `Time to setup: ${postSetup - preSetup}ms\n`
			+ `Time to probe: ${postHc - preHc}ms\n`
			+ `Probe attempts: ${probeData.probeAttempts}`
		);

		return new Response(
			'Customer setup successfully!\n'
				+ `Time to setup: ${postSetup - preSetup}ms\n`
				+ `Time to probe: ${postHc - preHc}ms\n`
				+ `Probe attempts: ${probeData.probeAttempts}`
		);
	},
} satisfies ExportedHandler<Env>;
