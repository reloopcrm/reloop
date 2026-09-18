import { Readable } from "node:stream";
import { SESSION_COOKIE_NAME } from "@crm/auth";
import { LOCALES } from "@crm/db/locale";
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
	@ApiQuery({
		name: "locale",
		required: false,
		enum: LOCALES,
		description:
			"The language of the fixed column headers and the file name. English when it is missing. Custom field labels stay as the workspace wrote them.",
	})
	@ApiQuery({
		name: "zone",
		required: false,
		description:
			"The IANA time zone the date columns are written in, for example Europe/Berlin. UTC when it is missing, which is what an API key gets.",
	})
	@ApiOkResponse({ description: "A UTF-8 CSV file." })
	async download(
		@Param("entity") entity: string,
		@Query("filter") filter: string | undefined,
		@Query("locale") locale: string | undefined,
		@Query("zone") zone: string | undefined,
		@Res({ passthrough: true }) response: Response,
	) {
		const request = this.read(entity, filter, locale, zone);
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

	private read(
		entity: string,
		filter: string | undefined,
		locale: string | undefined,
		zone: string | undefined,
	) {
		try {
			return parseExportRequest(entity, filter, locale, zone);
		} catch (cause) {
			throw new BadRequestException(
				cause instanceof Error ? cause.message : "That export is not known.",
			);
		}
	}
}
