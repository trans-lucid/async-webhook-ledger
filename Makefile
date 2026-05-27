.PHONY: validate-personalization install render scan-safety check-render validate-solution validate-candidate-main-expected-failure validate-docker-integration validate

node_modules/.package-lock.json: package-lock.json package.json
	npm ci

install: node_modules/.package-lock.json

render: install
	npm run render

scan-safety: install
	npm run scan:safety

check-render: install
	npm run check:render

validate-solution: install
	npm run validate:solution

validate-candidate-main-expected-failure: install
	npm run validate:candidate-main-expected-failure

validate-docker-integration: install
	npm run validate:docker-integration

validate-personalization: install
	npm run validate:personalization

validate: install
	npm run validate
