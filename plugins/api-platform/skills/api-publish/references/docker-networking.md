# Docker Networking: Upstream URLs

## The Problem

When the WSO2 gateway runs in Docker and your backend service runs on your host machine, `localhost` inside the container refers to the container itself — not your host machine. Using `localhost` as the upstream URL will result in connection refused errors, even though your backend is running fine.

**Wrong:**
```yaml
upstream:
  main:
    url: http://localhost:8081   # This points to inside the Docker container
```

**Correct:**
```yaml
upstream:
  main:
    url: http://192.168.1.42:8081  # Your host machine's actual IP
```

---

## Solution 1: Detect the Host IP (Most Reliable)

This works on all Docker environments: Docker Desktop, Rancher Desktop, Colima, Linux native Docker Engine.

**macOS** — resolve whichever interface owns the default route, then read its IPv4:
```bash
ipconfig getifaddr "$(route get default | awk '/interface: / {print $2}')"
```

**Linux** — print the source IP the kernel would use to reach an external address:
```bash
ip route get 1.1.1.1 | awk '{print $7; exit}'
```

**Windows (PowerShell)** — IPv4 of the interface that owns the default route:
```powershell
(Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway -ne $null}).IPv4Address.IPAddress
```

Use the returned IP directly in the upstream URL:
```yaml
upstream:
  main:
    url: http://192.168.1.42:8081
```

---

## Solution 2: host.docker.internal (Convenient but Limited)

`host.docker.internal` is a DNS name that resolves to the host machine's IP — but only on some Docker runtimes:

| Runtime | Supported? |
|---------|-----------|
| Docker Desktop (macOS / Windows) | ✓ Yes |
| Rancher Desktop | ✓ Yes |
| Colima | ✓ Yes |
| Linux native Docker Engine | ✗ No (unless started with `--add-host=host.docker.internal:host-gateway`) |

```yaml
upstream:
  main:
    url: http://host.docker.internal:8081
```

---

## Which to Use

**Default to Solution 1** (actual IP). It works everywhere without needing to know the runtime.

Use `host.docker.internal` if:
- The user confirms they're on Docker Desktop, Rancher Desktop, or Colima, AND
- You want a URL that stays stable across IP changes (e.g., switching networks).


---

## When the Backend is Also in Docker

If the user's backend service is itself running in a Docker container, neither host-IP detection nor `host.docker.internal` applies — connect the backend to the gateway's Docker network and address it by container name.

**1. Find the gateway's network** — query by the Compose project label so this works regardless of the network's actual name:
```bash
# Default project name is `gateway`; substitute if you overrode COMPOSE_PROJ when running setup-gateway.js
docker network ls --filter "label=com.docker.compose.project=gateway" --format '{{.Name}}'
```
If more than one network is listed, pick the one that isn't the project's default bridge — it's the one your compose file declared.

**2. Attach the backend container to that network:**
```bash
docker network connect <network-from-step-1> <backend-container-name>
```

**3. Use the backend's container name as the hostname** (stable across restarts; container IPs are not):
```yaml
upstream:
  main:
    url: http://<backend-container-name>:8081
```
