import { mirrorExportIfSignedIn } from "@/lib/beta-export-mirror";
import { APP_NAME } from "@/lib/brand";
import { buildExportDocumentFromProject, exportProjectWorkspace } from "@/lib/export";
import { fail } from "@/lib/api";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const { searchParams } = new URL(request.url);
    const requestedFormat = searchParams.get("format");
    const format =
      requestedFormat === "txt" ||
      requestedFormat === "json" ||
      requestedFormat === "pdf" ||
      requestedFormat === "epub"
        ? requestedFormat
        : "md";
    const projectResponse = await fetch(new URL(`/api/projects/${projectId}`, request.url), {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });
    const projectPayload = await projectResponse.json().catch(() => null);
    const project = projectPayload?.data?.project;

    if (!projectResponse.ok || !project) {
      return fail(
        typeof projectPayload?.error === "string" && projectPayload.error
          ? projectPayload.error
          : "Project not found.",
        projectResponse.status === 404 ? 404 : 400,
      );
    }

    if (format !== "json") {
      const document = buildExportDocumentFromProject(project);
      await mirrorExportIfSignedIn(format, document);
    }
    const content = await exportProjectWorkspace(project, format);
    const body = typeof content === "string" ? content : new Uint8Array(content);

    return new Response(body, {
      headers: {
        "Content-Type":
          format === "txt"
            ? "text/plain; charset=utf-8"
            : format === "pdf"
              ? "application/pdf"
            : format === "epub"
              ? "application/epub+zip"
            : format === "json"
              ? "application/json; charset=utf-8"
              : "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${APP_NAME.toLowerCase().replace(/\s+/g, "-")}-export.${format}"`,
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Export failed.");
  }
}
