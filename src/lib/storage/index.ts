import "server-only";
import { identifier, localDriver, organizationIdentifier } from "../config";
import { LocalStore } from "./local-store";
import { NamespacedStore } from "./namespaced-store";
import { SpacesStore } from "./spaces-store";
import type { Store } from "./types";

export { LocalStore } from "./local-store";
export { SpacesStore } from "./spaces-store";
export { checkKey, mapBounded, type Store } from "./types";

const stores = new Map<string, Store>();

export function contentStore(): Store {
  return storeFor("__content", "CONTENT");
}

export function projectStore(
  rawOrganizationId: string,
  rawProjectId: string,
  legacy = false,
  accessGuard?: (operation: keyof Store) => Promise<void>,
): Store {
  const organizationId = organizationIdentifier
    .parse(rawOrganizationId)
    .toLowerCase();
  const projectId = identifier.parse(rawProjectId);
  if (legacy) {
    const store = localDriver()
      ? storeFor(projectId, projectId)
      : new NamespacedStore(contentStore(), `projects/${projectId}`);
    return accessGuard ? withAccessGuard(store, accessGuard) : store;
  }

  const namespace = `organizations/${organizationId}/projects/${projectId}`;
  if (localDriver()) {
    const localScope = `${organizationId}/${projectId}`;
    const store = storeFor(localScope, localScope);
    return accessGuard ? withAccessGuard(store, accessGuard) : store;
  }
  const store = new NamespacedStore(contentStore(), namespace);
  return accessGuard ? withAccessGuard(store, accessGuard) : store;
}

function withAccessGuard(
  store: Store,
  accessGuard: (operation: keyof Store) => Promise<void>,
): Store {
  return new Proxy(store, {
    get(target, property) {
      const member = Reflect.get(target, property, target) as unknown;
      if (typeof member !== "function") return member;
      const bound = member.bind(target) as (...args: unknown[]) => unknown;
      if (property === "purgePrefixBatch" || property === "publicUrl")
        return bound;
      return async (...args: unknown[]) => {
        await accessGuard(property as keyof Store);
        return bound(...args);
      };
    },
  });
}

function storeFor(scope: string, prefix: string) {
  if (!stores.has(scope))
    stores.set(
      scope,
      localDriver() ? new LocalStore(scope) : new SpacesStore(prefix),
    );
  return stores.get(scope)!;
}
