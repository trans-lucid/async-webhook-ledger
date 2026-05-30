.PHONY: dev logs wait-services seed test run clean

dev:
	docker compose up -d

logs:
	docker compose logs -f

wait-services:
	python3 scripts/wait_services.py

seed: wait-services
	npm install
	npm run migrate
	test -f fixtures/public/public_events.jsonl
	AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_REGION=us-east-1 \
		npm run queue:setup

test:
	npm run test:public

run:
	npm run worker

clean:
	docker compose down -v
