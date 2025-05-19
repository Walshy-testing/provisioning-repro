import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

export class HealthcheckTest extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async startProbing(hostname: string) {
		// Start probing every 2.5s until it suceeds
		let successful = false;
		let probeAttempts = 0;
		do {
			probeAttempts++;
			successful = await this.probe(`https://${hostname}/`);

			await new Promise((resolve) => setTimeout(resolve, 2_500));
		} while (!successful);

		return { probeAttempts };
	}

	async probe(url: string): Promise<boolean> {
		const res = await fetch(url);

		if (res.status !== 200) {
			console.log(`[${new Date().toISOString()}] ${url} returned ${res.status}: ${await res.text()}`);
		}

		return res.status === 200;
	}
}

export default class extends WorkerEntrypoint<Env> {
	async fetch(): Promise<Response> {
		return new Response('use rpc');
	}

	async startHealthcheck(id: string, hostname: string) {
		const doId: DurableObjectId = this.env.HEALTHCHECK_DO.idFromName(id);
		const stub = this.env.HEALTHCHECK_DO.get(doId);

		try {
			return await stub.startProbing(hostname);
		} catch(e) {
			return new Response(`Failed to probe ${hostname}: ${(e as Error).message}\n${(e as Error).stack}`);
		}
	}
}
