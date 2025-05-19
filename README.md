# repro for provisioning delay

## Setup

```sh
cd healthcheck-probe
npm i 

cd ../provision-worker
npm i
echo "API_TOKEN=<YOUR_API_TOKEN>" > .dev.vars
```

Change account IDs in `wrangler.jsonc` to point to your target main account.

Update values at the top of `provision-worker/index.ts` with the account/zone IDs you want to target.

Now deploy:
```sh
./deploy.sh
```

Finally, change the workers.dev in `test.sh` to point to your deployed provision-worker.

## Run

To run, simply run the test.sh script:
```sh
./test.sh
```