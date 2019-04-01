default: test lint

lint:
	@npm run lint --silent

test:
	@npm run test --silent

.PHONY: default lint test

