import "reflect-metadata";
import { expect, it } from "bun:test";
import { Controller, Get } from "@nestjs/common";
import { ApiOperation } from "@nestjs/swagger";

@Controller("test")
class DecoratorController {
	@Get()
	@ApiOperation({ summary: "Decorator verification" })
	read() {
		return "ok";
	}
}

it("uses classic method decorators for API tests", () => {
	expect(Reflect.getMetadata("path", DecoratorController)).toBe("test");
	expect(
		Reflect.getMetadata(
			"swagger/apiOperation",
			DecoratorController.prototype.read,
		),
	).toMatchObject({ summary: "Decorator verification" });
});
