#!/bin/bash

time curl "https://provision-worker.walshydev.workers.dev/$(date +"%s" | sha1sum | awk '{print $1}')" -H 'x-walshy: true' -v
