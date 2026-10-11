import { redirect } from "next/navigation";
import { allowedProjects, currentAuthContext } from "@/lib/auth";
import ProjectPicker from "@/components/project-picker";
export default async function ProjectsPage() {
  const context = await currentAuthContext();
  if (!context) redirect("/login");
  const { actor } = context;
  const projects = await allowedProjects(context);
  return <ProjectPicker actor={actor} projects={projects} />;
}
