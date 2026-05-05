import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

// Extend Fastify types
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}

interface JwtPayload {
  userId: string;
  phone: string;
  iat: number;
  exp: number;
}

export default fp(async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate(
    "authenticate",
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return reply.status(401).send({
            error: "Missing or invalid authorization header",
            code: "AUTH_REQUIRED",
          });
        }

        const token = authHeader.slice(7);
        const decoded = fastify.jwt.verify<JwtPayload>(token);

        // Attach userId to request for downstream handlers
        (request as any).userId = decoded.userId;
        (request as any).userPhone = decoded.phone;
      } catch (error: any) {
        if (error.code === "FAST_JWT_EXPIRED") {
          return reply.status(401).send({
            error: "Token expired",
            code: "TOKEN_EXPIRED",
          });
        }
        return reply.status(401).send({
          error: "Invalid token",
          code: "TOKEN_INVALID",
        });
      }
    }
  );
});
