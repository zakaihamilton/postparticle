"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Actor } from "@/lib/types";
import { api } from "./ui";
import Select from "./select";
import styles from "./organization-switcher.module.css";

export function OrganizationSwitcher({
  actor,
  onBeforeChange,
}: {
  actor: Actor;
  onBeforeChange?: () => Promise<boolean>;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState({
    organizationId: actor.organizationId,
    selected: actor.organizationId,
  });
  const selected =
    selection.organizationId === actor.organizationId
      ? selection.selected
      : actor.organizationId;
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function changeOrganization(organizationId: string) {
    setSelection({
      organizationId: actor.organizationId,
      selected: organizationId,
    });
    setError("");
    setPending(true);
    try {
      if (onBeforeChange && !(await onBeforeChange())) {
        setSelection({
          organizationId: actor.organizationId,
          selected: actor.organizationId,
        });
        return;
      }
      await api("/api/auth/organization", {
        method: "POST",
        body: JSON.stringify({ organizationId }),
      });
      router.replace("/projects");
      router.refresh();
    } catch (cause) {
      setSelection({
        organizationId: actor.organizationId,
        selected: actor.organizationId,
      });
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.switcher}>
      {actor.organizations.length > 1 ? (
        <>
          <span className={styles.label}>Organization</span>
          <Select
            label="Organization"
            value={selected}
            options={actor.organizations.map((organization) => ({
              value: organization.organizationId,
              label: organization.organizationName,
            }))}
            onValueChange={changeOrganization}
            disabled={pending}
            className={styles.select}
          />
        </>
      ) : (
        <span className={styles.single}>{actor.organizationName}</span>
      )}
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
