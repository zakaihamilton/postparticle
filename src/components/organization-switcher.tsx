"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";
import type { Actor } from "@/lib/types";
import { api } from "./ui";
import styles from "./organization-switcher.module.css";

export function OrganizationSwitcher({
  actor,
  onBeforeChange,
}: {
  actor: Actor;
  onBeforeChange?: () => Promise<boolean>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(actor.organizationId);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => setSelected(actor.organizationId), [actor.organizationId]);

  async function changeOrganization(event: ChangeEvent<HTMLSelectElement>) {
    const organizationId = event.currentTarget.value;
    setSelected(organizationId);
    setError("");
    setPending(true);
    try {
      if (onBeforeChange && !(await onBeforeChange())) {
        setSelected(actor.organizationId);
        return;
      }
      await api("/api/auth/organization", {
        method: "POST",
        body: JSON.stringify({ organizationId }),
      });
      router.replace("/projects");
      router.refresh();
    } catch (cause) {
      setSelected(actor.organizationId);
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.switcher}>
      {actor.organizations.length > 1 ? (
        <>
          <label className={styles.label} htmlFor="active-organization">
            Organization
          </label>
          <select
            id="active-organization"
            className={styles.select}
            aria-label="Organization"
            value={selected}
            onChange={changeOrganization}
            disabled={pending}
          >
            {actor.organizations.map((organization) => (
              <option key={organization.organizationId} value={organization.organizationId}>
                {organization.organizationName}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span className={styles.single}>{actor.organizationName}</span>
      )}
      {error ? <span className={styles.error} role="alert">{error}</span> : null}
    </div>
  );
}
