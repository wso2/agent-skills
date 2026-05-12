# Asgardeo Vue 3 Integration

Package: `@asgardeo/vue`
Requires: Vue ≥3.5.0, vue-router ≥4.0.0
Base URL pattern: `https://api.asgardeo.io/t/<org_name>`

## 1. Install

```bash
npm install @asgardeo/vue
```

## 2. Register the plugin in main.ts

```ts
// src/main.ts
import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createAsgardeo } from "@asgardeo/vue";
import App from "./App.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: () => import("./views/HomeView.vue") },
    { path: "/callback", component: () => import("./views/CallbackView.vue") },
  ],
});

const asgardeo = createAsgardeo({
  baseUrl: "https://api.asgardeo.io/t/<org_name>",
  clientId: "<app_id>",
  signInRedirectURL: "<redirect_uri>",
  signOutRedirectURL: "<app_base_url>",
  scope: ["openid", "profile", "email"],
});

const app = createApp(App);
app.use(router);
app.use(asgardeo);
app.mount("#app");
```

## 3. Add login/logout in a component

```vue
<!-- src/App.vue -->
<script setup lang="ts">
import { useAsgardeo } from "@asgardeo/vue";

const { state, signIn, signOut } = useAsgardeo();
</script>

<template>
  <div v-if="state.isLoading">Loading...</div>
  <div v-else-if="state.isAuthenticated">
    <p>Welcome, {{ state.username }}</p>
    <button @click="signOut()">Logout</button>
  </div>
  <div v-else>
    <button @click="signIn()">Login with Asgardeo</button>
  </div>
</template>
```

## 4. Add a callback view

```vue
<!-- src/views/CallbackView.vue -->
<script setup lang="ts">
// @asgardeo/vue handles the callback automatically on mount.
// This view just shows a loading state while the SDK processes the code.
import { useAsgardeo } from "@asgardeo/vue";
const { state } = useAsgardeo();
</script>

<template>
  <div v-if="state.isLoading">Completing login...</div>
</template>
```

## Notes

- `signInRedirectURL` must exactly match the redirect URI registered in Asgardeo.
- The `/callback` route must be registered in vue-router before the SDK initialises.
- vue-router is a required peer dependency — install it if not already present: `npm install vue-router`.
- `state.username` and any other user field beyond the bare subject only populates when the app's `config-<profile>.yaml` declares those claims under `user_attributes:` and `asgardeo apply` was run. Add at minimum `["emailaddress", "given_name", "family_name"]` for a name/email UI; add `"groups"` for group-gated UI.
