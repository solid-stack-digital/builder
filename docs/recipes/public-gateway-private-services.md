# Publish only a gateway

Make gateway, frontend and backend effective mesh roots, with gateway requisites that reach the services it calls. Publish only `services.gateway.publish: ["main.endpoints.http"]`; leave backend and frontend publication empty. The global black-box tester can use `${gateway.source.main.endpoints.http.public_url}`. Private sources still have network URLs for reachable internal consumers and no host binding merely because they declare `publicPort`. See [mesh publication](../concepts/publication-and-ports.md).
