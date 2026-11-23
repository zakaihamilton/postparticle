import { redirect } from "next/navigation";
import { AccountArea } from "@/components/account-area";
import { ResetPlatformAccountPassword } from "@/components/settings";
import { currentActor, minimumAccountPasswordLength } from "@/lib/auth";

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
        minimumPasswordLength={minimumAccountPasswordLength()}
      />
    </AccountArea>
  );
}
