#!/bin/bash

echo "Deploying healthcheck-probe..."
cd healthcheck-probe
npx wrangler deploy

cd ..

echo ""
echo "Deploying provision-worker..."
cd provision-worker
npx wrangler deploy

echo ""
echo "Done!"
