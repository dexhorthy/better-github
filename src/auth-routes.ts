import type { Context, Hono, MiddlewareHandler } from "hono";
import type { MagicLinkResult, VerifyResult } from "./auth-core";

export type AuthRouteVariables = {
	user: { email: string };
};

type AuthContext<
	Bindings extends object,
	Variables extends AuthRouteVariables,
> = Context<{
	Bindings: Bindings;
	Variables: Variables;
}>;

type AuthRouteDeps<
	Bindings extends object,
	Variables extends AuthRouteVariables,
> = {
	requestMagicLink: (
		c: AuthContext<Bindings, Variables>,
		email: string,
		baseUrl: string,
	) => Promise<MagicLinkResult>;
	verifyMagicLink: (
		c: AuthContext<Bindings, Variables>,
		token: string,
	) => Promise<VerifyResult>;
	verifyToken: (
		c: AuthContext<Bindings, Variables>,
		token: string,
	) => Promise<{ email: string } | null>;
};

export function registerAuthRoutes<
	Bindings extends object,
	Variables extends AuthRouteVariables,
>(
	app: Hono<{ Bindings: Bindings; Variables: Variables }>,
	deps: AuthRouteDeps<Bindings, Variables>,
): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> {
	app.post("/api/auth/request-link", async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as { email?: string };
		const baseUrl = new URL(c.req.url).origin;
		const result = await deps.requestMagicLink(c, body.email ?? "", baseUrl);
		if (!result.ok) return c.json({ error: result.error }, 400);
		return c.json({ ok: true });
	});

	app.get("/api/auth/verify", async (c) => {
		const token = c.req.query("token") ?? "";
		const result = await deps.verifyMagicLink(c, token);
		if (!result.ok) return c.json({ error: result.error }, 401);
		return c.json({ token: result.token, email: result.email });
	});

	return async (c, next) => {
		const authHeader = c.req.header("Authorization");
		const token = authHeader?.startsWith("Bearer ")
			? authHeader.slice(7)
			: null;
		if (!token) return c.json({ error: "Authentication required" }, 401);
		const user = await deps.verifyToken(c, token);
		if (!user) return c.json({ error: "Invalid or expired token" }, 401);
		c.set("user", user);
		await next();
	};
}
