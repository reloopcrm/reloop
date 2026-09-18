import { Module } from "@nestjs/common";
import { CompaniesModule } from "../companies/companies.module";
import { ContactsModule } from "../contacts/contacts.module";
import { DealsModule } from "../deals/deals.module";
import { FieldsModule } from "../fields/fields.module";
import { ExportsController } from "./exports.controller";
import { ExportsService } from "./exports.service";

@Module({
	imports: [ContactsModule, CompaniesModule, DealsModule, FieldsModule],
	controllers: [ExportsController],
	providers: [ExportsService],
})
export class ExportsModule {}
