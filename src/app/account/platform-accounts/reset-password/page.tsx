import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { AccountArea } from "@/components/account-area";
import { ResetPlatformAccountPassword } from "@/components/settings";

export default async function ResetPlatformAccountPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ username?: string | string[] }>;
}) {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  if (!actor.platformAdmin) redirect("/account");
  const params = await searchParams;
  const username = typeof params.username === "string" ? params.username : "";

  return (
    <AccountArea actor={actor} activeSection="platform-accounts">
      <ResetPlatformAccountPassword
        currentUsername={actor.username}
        initialUsername={username}
      />
    </AccountArea>
  );
}
