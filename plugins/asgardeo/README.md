# asgardeo Plugin

Agent skill for Asgardeo.

## Skills

| Skill | Triggers |
|-------|----------|
| **asgardeo** | Add login, SSO, MFA or passwordless sign-in to an app; gate features or an API by role or scope; give an AI agent its own identity or act-on-behalf-of tokens; secure an MCP server; create and manage any Asgardeo resource through the `asg` CLI; debug a 403 or a login that won't complete |

## Getting Started

See the [installation instructions](../../README.md#installation) in the main README to install this plugin. Once installed, just describe what you want in plain language — the skill will pick up the request. Below are some prompts to try.

### Adding authentication to an app

Go from zero to working login in your framework of choice.

```
> Add Asgardeo login to my React app.
```
```
> Integrate Asgardeo authentication into my Next.js project.
```
```
> Set up SSO for my Vue SPA using Asgardeo.
```

The skill installs the `asg` CLI, helps you log in, registers an OAuth2/OIDC application, and wires the matching Asgardeo SDK into your code.

### Gating features by role

```
> Only admins should be able to delete orders in my app — set that up with Asgardeo.
```
```
> Protect my Express API with Asgardeo so callers need the read:orders scope.
```

### Giving an AI agent an identity

```
> My LangChain agent calls the Orders API — give it its own Asgardeo identity.
```
```
> Let my assistant act on behalf of the signed-in user when it calls my API.
```

### Securing an MCP server

```
> Anyone can call my MCP server right now. Require Asgardeo login and let only admins use create_order.
```

### Managing applications

```
> Create an OIDC app in Asgardeo and give me the client ID.
```
```
> List my Asgardeo applications.
```
```
> Update the redirect URIs on my web-portal app.
```

### Managing users, groups, and roles

```
> Create a user in my Asgardeo org.
```
```
> Add the developers group to the admin role.
```
```
> Show me all roles assigned to user alice.
```

### Managing API resources and scopes

```
> Register an API resource for my payments service in Asgardeo.
```
```
> Add a read:orders scope to my orders API.
```

### Other resources

The CLI also manages identity providers, branding, organizations, and agents — just describe what you need.

```
> List the identity providers configured in my org.
```
```
> Update the branding for my Asgardeo org.
```
