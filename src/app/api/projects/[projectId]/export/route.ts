import { mirrorExportIfSignedIn } from "@/lib/beta-export-mirror";
import { APP_NAME } from "@/lib/brand";
import { buildExportDocument, exportProject } from "@/lib/export";
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
    if (format !== "json") {
      const document = await buildExportDocument(projectId);
      await mirrorExportIfSignedIn(format, document);
    }
    const content = await exportProject(projectId, format);
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
