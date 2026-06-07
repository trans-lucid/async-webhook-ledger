.PHONY: validate-personalization install render scan-safety check-render check-published-repo validate-solution validate-candidate-main-expected-failure validate-docker-integration validate-published-contract validate

node_modules/.package-lock.json: package-lock.json package.json
	npm ci

install: node_modules/.package-lock.json

render: install
	npm run render

scan-safety: install
	npm run scan:safety

check-render: install
	npm run check:render

check-published-repo: install
	npm run check:published-repo

validate-solution: install
	npm run validate:solution

validate-candidate-main-expected-failure: install
	npm run validate:candidate-main-expected-failure

validate-docker-integration: install
	npm run validate:docker-integration

validate-personalization: install
	npm run validate:personalization

validate-published-contract: install
	npm run validate:published-contract

validate: install
	npm run validate
