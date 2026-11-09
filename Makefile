# No host Node required: npm runs in the official image when `npm` isn't on PATH.
HOST_NPM := $(shell command -v npm 2>/dev/null)
DOCKER_RUN = docker run --rm -u $$(id -u):$$(id -g) -e HOME=/tmp -v $(CURDIR):/repo $(1) node:22-bookworm-slim
DOCKER_NPM = $(call DOCKER_RUN,-w /repo/web $(1)) npm
WEB_ENV = -e NEXT_PUBLIC_MINT_URL -e ASSAY_DEV_ORIGINS
NPM ?= $(if $(HOST_NPM),npm,$(call DOCKER_NPM,$(WEB_ENV)))
NPM_DEV ?= $(if $(HOST_NPM),npm,$(call DOCKER_NPM,-p $(PORT):$(PORT) $(WEB_ENV)))
NODE ?= $(if $(HOST_NPM),node,$(call DOCKER_RUN,-w /repo -p $(MOCK_PORT):$(MOCK_PORT) -e MOCK_PORT=$(MOCK_PORT) -e MOCK_STEP_MS) node)
PORT ?= 3108
MOCK_PORT ?= 8108
MINT ?= ../argus-mint

.PHONY: help install dev mock fixture wire build test lint check clean

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install:  ## Web dependencies
	cd web && $(NPM) ci

dev:  ## next dev on :$(PORT), calling argus-mint at NEXT_PUBLIC_MINT_URL (default http://localhost:8108)
	cd web && $(NPM_DEV) run dev -- --hostname 0.0.0.0 --port $(PORT)

mock:  ## Serve the fixture as an argus-mint on :$(MOCK_PORT) (no GPU, darkroom, IPFS or wallet)
	$(NODE) scripts/mock_mint.mjs

fixture:  ## Copy the recorded API fixture from argus-mint (MINT=../argus-mint)
	rm -rf fixture && cp -r $(MINT)/fixtures/api fixture

wire:  ## Regenerate the wire types from the pinned schema (web/schema/pins.json)
	cd web && $(NPM) run wire:types

build:  ## next build
	cd web && $(NPM) run build

test:  ## vitest
	cd web && $(NPM) test

lint:  ## eslint + tsc + wire types match the pin
	cd web && $(NPM) run lint && $(NPM) run typecheck && $(NPM) run wire:check

check: lint test build  ## Everything CI runs

clean:  ## Remove build output
	rm -rf web/.next
