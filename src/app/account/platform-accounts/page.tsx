import { redirect } from "next/navigation";
import { AccountArea } from "@/components/account-area";
import { PlatformAccountsSettings } from "@/components/settings";
import { currentActor } from "@/lib/auth";

export default async function PlatformAccountsPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  if (!actor.platformAdmin) redirect("/account");

  return (
    <AccountArea actor={actor} activeSection="platform-accounts">
      <PlatformAccountsSettings currentUsername={actor.username} />
    </AccountArea>
  );
}
