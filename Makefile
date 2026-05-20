
.PHONY: render scan-safety check-render validate-solution validate-candidate-main-expected-failure validate-docker-integration validate

render:
	npm run render

scan-safety:
	npm run scan:safety

check-render:
	npm run check:render

validate-solution:
	npm run validate:solution

validate-candidate-main-expected-failure:
	npm run validate:candidate-main-expected-failure

validate-docker-integration:
	npm run validate:docker-integration

validate:
	npm run validate
