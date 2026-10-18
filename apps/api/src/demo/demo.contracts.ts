import { LOCALES } from "@crm/db/locale";
import { z } from "zod";

export const sampleDataLoadInput = z.object({ locale: z.enum(LOCALES) });

export type SampleDataLoadInput = z.infer<typeof sampleDataLoadInput>;

export const sampleDataStatusOutput = z.object({
	present: z.boolean(),
	canManage: z.boolean(),
	loadable: z.boolean(),
});

export type SampleDataStatus = z.infer<typeof sampleDataStatusOutput>;

export const sampleDataResultOutput = z.object({
	present: z.boolean(),
	rows: z.number(),
});

export type SampleDataResult = z.infer<typeof sampleDataResultOutput>;
