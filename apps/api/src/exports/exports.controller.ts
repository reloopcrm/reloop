import { Readable } from "node:stream";
import { SESSION_COOKIE_NAME } from "@crm/auth";
import {
	BadRequestException,
	Controller,
	Get,
	Param,
	Query,
	Res,
	StreamableFile,
} from "@nestjs/common";
import {
	ApiCookieAuth,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { EXPORT_ENTITIES, parseExportRequest } from "./exports.contracts";
import { ExportsService } from "./exports.service";
import { EXPORTS } from "./exports-config";

@ApiTags("Exports")
@ApiCookieAuth(SESSION_COOKIE_NAME)
@Controller("api/exports")
export class ExportsController {
	constructor(private readonly exports: ExportsService) {}

	@Get(":entity")
	@ApiOperation({ summary: "Download a filtered list as CSV" })
	@ApiParam({ name: "entity", enum: EXPORT_ENTITIES })
	@ApiQuery({
		name: "filter",
		required: false,
		description:
			"The list input, JSON encoded. The same shape the list procedure takes, so the file holds exactly the rows the list shows.",
	})
	@ApiOkResponse({ description: "A UTF-8 CSV file." })
	async download(
		@Param("entity") entity: string,
		@Query("filter") filter: string | undefined,
		@Res({ passthrough: true }) response: Response,
	) {
		const request = this.read(entity, filter);
		const file = await this.exports.file(request);

		response.setHeader("Cache-Control", "private, no-store");
		response.setHeader("Content-Type", EXPORTS.csv.mediaType);
		response.setHeader(
			"Content-Disposition",
			`attachment; filename="${file.filename}"`,
		);
		response.setHeader("X-Content-Type-Options", "nosniff");

		return new StreamableFile(Readable.from(file.lines));
	}

	private read(entity: string, filter: string | undefined) {
		try {
			return parseExportRequest(entity, filter);
		} catch (cause) {
			throw new BadRequestException(
				cause instanceof Error ? cause.message : "That export is not known.",
			);
		}
	}
}
