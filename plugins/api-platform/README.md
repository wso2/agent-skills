# api-platform Plugin

Agent skills for the WSO2 API Platform.

## Skills

| Skill | Triggers |
|-------|----------|
| **api-design** | Design an OpenAPI spec from scratch; assess a spec for AI agent readiness, security, or design quality; fix spec issues |
| **api-publish** | Set up the WSO2 API Gateway; expose a backend service as a managed API; add auth, rate limiting, or header policies |

## Getting Started

See the [installation instructions](../../README.md#installation) in the main README to install this plugin. Once installed, just describe what you want in plain language — the right skill will pick up the request. Below are some prompts to try.

### Designing an API

Go from an idea to a production-quality OpenAPI 3.x spec.

```
> I want to build a REST API for a bookstore — help me design the OpenAPI spec.
```
```
> Draft an OpenAPI spec for a task management service with users, projects, and tasks.
```
```
> I need an API for an internal HR system that manages employees and leave requests. Scaffold the spec.
```

The skill walks you through the domain, data model, and resources conversationally, then produces a YAML spec aligned with the WSO2 REST API Design Guidelines.

### Assessing an Existing Spec

Already have a spec? Find out how good it is.

```
> Review petstore.yaml for AI agent readiness.
```
```
> Check my spec against the OWASP API Top 10.
```
```
> Assess orders-api.yaml for design quality and security and give me a report.
```

You will get a report grouped by severity across three dimensions: AI Agent Readiness, Security Readiness, and API Design Guidelines.

### Fixing Spec Issues

Clean up known issues — usually after an assessment.

```
> Fix all HIGH severity issues in the report.
```
```
> Apply all autoFixable fixes from the assessment.
```
```
> Fix issue spec-014 in orders-api.yaml.
```

### Setting up the WSO2 API Gateway

Get a local gateway running and expose a backend service through it.

```
> Set up the WSO2 API Platform Gateway on my machine.
```
```
> I have a service running on localhost:8081 — expose it through the WSO2 gateway.
```
```
> Deploy my orders service as a managed API and test it end to end.
```

The skill installs the `ap` CLI, brings up the gateway in Docker, deploys your API, and verifies it.

### Adding Policies to a Published API

Add gateway behavior once an API is deployed.

```
> Add rate limiting of 100 requests per minute to the orders API.
```
```
> Require an API key on the products API.
```
```
> Inject an X-Tenant-ID header on every upstream request to the customers API.
```

### A Full End-to-End Walkthrough

A common first session strings the skills together:

```
> Design an OpenAPI spec for a simple inventory service.
```
```
> Now assess it for AI agent readiness and security.
```
```
> Fix all HIGH and MEDIUM severity issues.
```
```
> Set up the WSO2 gateway locally and publish this API against my backend at localhost:9000.
```
```
> Add an API key requirement and a 60 rpm rate limit.
```

By the end you have a vetted spec, a running gateway, and a managed API with policies — all from natural-language prompts.

