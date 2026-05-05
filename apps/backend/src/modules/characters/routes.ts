import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, and, ilike, sql, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { characters, favorites, conversations } from "../../db/schema.js";
import { listCharactersSchema, uuidParamSchema } from "../../utils/schemas.js";

async function listCharacters(
  request: FastifyRequest<{ Querystring: Record<string, string> }>,
  reply: FastifyReply
) {
  const { category, search, page, limit } = listCharactersSchema.parse(request.query);
  const offset = (page - 1) * limit;

  const conditions = [eq(characters.isActive, true)];
  if (category) {
    conditions.push(eq(characters.category, category.toLowerCase()));
  }
  if (search) {
    conditions.push(ilike(characters.name, `%${search}%`));
  }

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(characters)
      .where(and(...conditions))
      .orderBy(characters.sortOrder, desc(characters.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(characters)
      .where(and(...conditions)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  // If authenticated, include favorite status
  const userId = (request as any).userId as string | undefined;
  let favoriteIds: Set<string> = new Set();
  if (userId) {
    const userFavs = await db
      .select({ characterId: favorites.characterId })
      .from(favorites)
      .where(eq(favorites.userId, userId));
    favoriteIds = new Set(userFavs.map((f) => f.characterId));
  }

  return reply.send({
    characters: results.map((c) => ({
      id: c.id,
      name: c.name,
      avatarUrl: c.avatarUrl,
      category: c.category,
      personality: c.personality,
      backstory: c.backstory.slice(0, 150) + "...",
      isPremium: c.isPremium,
      isFavorite: favoriteIds.has(c.id),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

async function getCharacter(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = uuidParamSchema.parse(request.params);

  const [character] = await db
    .select()
    .from(characters)
    .where(and(eq(characters.id, id), eq(characters.isActive, true)))
    .limit(1);

  if (!character) {
    return reply.status(404).send({ error: "Character not found" });
  }

  // Check if favorited by user
  const userId = (request as any).userId as string | undefined;
  let isFavorite = false;
  let conversationId: string | null = null;

  if (userId) {
    const [fav] = await db
      .select()
      .from(favorites)
      .where(
        and(eq(favorites.userId, userId), eq(favorites.characterId, id))
      )
      .limit(1);
    isFavorite = !!fav;

    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          eq(conversations.characterId, id)
        )
      )
      .limit(1);
    conversationId = conv?.id ?? null;
  }

  return reply.send({
    id: character.id,
    name: character.name,
    avatarUrl: character.avatarUrl,
    category: character.category,
    personality: character.personality,
    backstory: character.backstory,
    scenarioIntro: character.scenarioIntro,
    isPremium: character.isPremium,
    isFavorite,
    conversationId,
  });
}

async function toggleFavorite(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const userId = (request as any).userId as string;
  const { id: characterId } = uuidParamSchema.parse(request.params);

  // Check if already favorited
  const [existing] = await db
    .select()
    .from(favorites)
    .where(
      and(eq(favorites.userId, userId), eq(favorites.characterId, characterId))
    )
    .limit(1);

  if (existing) {
    await db
      .delete(favorites)
      .where(
        and(
          eq(favorites.userId, userId),
          eq(favorites.characterId, characterId)
        )
      );
    return reply.send({ isFavorite: false });
  }

  await db.insert(favorites).values({ userId, characterId });
  return reply.send({ isFavorite: true });
}

async function getCategories(_request: FastifyRequest, reply: FastifyReply) {
  const result = await db
    .selectDistinct({ category: characters.category })
    .from(characters)
    .where(eq(characters.isActive, true))
    .orderBy(characters.category);

  return reply.send({
    categories: result.map((r) => r.category),
  });
}

// ─── DEFAULT CHARACTER (single-character flow) ────────

async function getDefaultCharacter(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Find Kavya first, fallback to first active character by sort order
  let [character] = await db
    .select()
    .from(characters)
    .where(and(eq(characters.isActive, true), ilike(characters.name, "kavya")))
    .limit(1);

  if (!character) {
    [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.isActive, true))
      .orderBy(characters.sortOrder)
      .limit(1);
  }

  if (!character) {
    return reply.status(404).send({ error: "No characters available" });
  }

  return reply.send({
    id: character.id,
    name: character.name,
    avatarUrl: character.avatarUrl,
    category: character.category,
    personality: character.personality,
    backstory: character.backstory.slice(0, 150) + "...",
    isPremium: character.isPremium,
  });
}

// ─── ROUTE REGISTRATION ───────────────────────────────

export async function characterRoutes(fastify: FastifyInstance) {
  // Public (but auth optional for favorite status)
  fastify.get("/characters", listCharacters);
  fastify.get("/characters/default", getDefaultCharacter);
  fastify.get("/characters/categories", getCategories);
  fastify.get("/characters/:id", getCharacter);

  // Protected
  fastify.post("/characters/:id/favorite", {
    preHandler: [fastify.authenticate],
    handler: toggleFavorite,
  });
}
