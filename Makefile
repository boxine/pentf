default: test lint

lint:
	@npm run lint --silent

test:
	@npm run test --silent

lockserver-dev:
	node_modules/.bin/nodemon lockserver/lockserver.js

.PHONY: default lint test lockserver-dev

