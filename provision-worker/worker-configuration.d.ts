// Generated by Wrangler by running `wrangler types --include-runtime=false` (hash: 4c81d17e8de07f650cddf73ce751ba8d)
declare namespace Cloudflare {
	interface Env {
		PROVISION_DO: DurableObjectNamespace<import("./src/index").ProvisioningTest>;
		API_TOKEN: string;
		HEALTHCHECK_PROBER: Fetcher & { startHealthcheck: (id: string, url: string) => Promise<{ probeAttempts: number }> };
	}
}
interface Env extends Cloudflare.Env {}

interface V4Response<T = unknown | null> {
	success: boolean;
	result: T;
	messages: string[];
	errors: { code: number, message: string }[];
}

interface Zone {
	id: string;
	name: string;
	name_servers: string[];
}
