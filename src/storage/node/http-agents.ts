import type { AxiosInstance } from "axios";

/**
 * Node-only HTTP(S) agents for libvex axios — lives under `storage/node/` so the
 * platform-guard plugin allows `node:http` / `node:https` (see poison-node-imports).
 */
import * as nodeHttp from "node:http";
import * as nodeHttps from "node:https";

export interface NodeHttpAgentPair {
    readonly http: nodeHttp.Agent;
    readonly https: nodeHttps.Agent;
}

export function createNodeHttpAgents(): NodeHttpAgentPair {
    return {
        http: new nodeHttp.Agent({ keepAlive: true }),
        https: new nodeHttps.Agent({ keepAlive: true }),
    };
}

export function attachNodeAgentsToAxios(
    instance: AxiosInstance,
    agents: NodeHttpAgentPair,
): void {
    instance.defaults.httpAgent = agents.http;
    instance.defaults.httpsAgent = agents.https;
}

export function destroyNodeHttpAgents(agents: NodeHttpAgentPair): void {
    agents.http.destroy();
    agents.https.destroy();
}
