//supabase/functions/delete-auth-user/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "create" | "update" | "delete";

type SupabaseAdminClient = ReturnType<typeof createClient>;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function isUuid(value: unknown): boolean {
  const v = asTrimmedString(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const v = asTrimmedString(value);
    if (v) return v;
  }
  return "";
}

function toNullableString(value: unknown): string | null {
  const v = asTrimmedString(value);
  return v ? v : null;
}

function extractSucursalId(body: any): string {
  return firstNonEmpty(
    body?.sucursal_id,
    body?.sucursalId,
    body?.sucursal?.id,
    body?.data?.sucursal_id,
    body?.data?.sucursalId,
    body?.payload?.sucursal_id,
    body?.payload?.sucursalId,
    body?.payload?.data?.sucursal_id,
    body?.payload?.data?.sucursalId,
  );
}

function extractEmail(body: any): string {
  return firstNonEmpty(
    body?.email,
    body?.data?.email,
    body?.payload?.email,
    body?.payload?.data?.email,
  );
}

function extractPassword(body: any): string {
  return firstNonEmpty(
    body?.password,
    body?.data?.password,
    body?.payload?.password,
    body?.payload?.data?.password,
  );
}

function extractNombre(body: any): string {
  return firstNonEmpty(
    body?.nombre,
    body?.data?.nombre,
    body?.payload?.nombre,
    body?.payload?.data?.nombre,
  );
}

function extractRole(body: any): string {
  return firstNonEmpty(
    body?.role,
    body?.data?.role,
    body?.payload?.role,
    body?.payload?.data?.role,
    "empleado",
  );
}

function extractEmpresaId(body: any): string {
  return firstNonEmpty(
    body?.empresa_id,
    body?.data?.empresa_id,
    body?.payload?.empresa_id,
    body?.payload?.data?.empresa_id,
    "UNICA EMPRESA",
  );
}

function getContactData(body: any) {
  return {
    nombre: firstNonEmpty(
      body?.data?.nombre,
      body?.payload?.data?.nombre,
      body?.contacto?.nombre,
      body?.nombre,
    ),
    telefono: toNullableString(
      firstNonEmpty(
        body?.data?.telefono,
        body?.payload?.data?.telefono,
        body?.contacto?.telefono,
        body?.telefono,
      ),
    ),
    email: toNullableString(
      firstNonEmpty(
        body?.data?.email,
        body?.payload?.data?.email,
        body?.contacto?.email,
        body?.email,
      ),
    ),
    identificacion: toNullableString(
      firstNonEmpty(
        body?.data?.identificacion,
        body?.payload?.data?.identificacion,
        body?.contacto?.identificacion,
        body?.identificacion,
      ),
    ),
    direccion: toNullableString(
      firstNonEmpty(
        body?.data?.direccion,
        body?.payload?.data?.direccion,
        body?.contacto?.direccion,
        body?.direccion,
      ),
    ),
  };
}

function extractJornadas(body: any): string[] {
  const raw = Array.isArray(body?.jornadas)
    ? body.jornadas
    : Array.isArray(body?.payload?.jornadas)
      ? body.payload.jornadas
      : [];

  return raw
    .map((v: unknown) => asTrimmedString(v))
    .filter((v: string) => isUuid(v));
}

async function getAuthenticatedAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: "Falta Authorization", status: 401 as const };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return { error: "Token inválido", status: 401 as const };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: "Faltan variables de entorno", status: 500 as const };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return { error: "Token inválido o expirado", status: 401 as const };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return {
    admin,
    supabaseUrl,
    token,
    user: userData.user,
  };
}

async function getRequesterRole(admin: SupabaseAdminClient, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("usuarios")
    .select("role")
    .eq("usuarios_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return String(data?.role || "").toLowerCase() || null;
}

async function replaceUserJornadas(admin: SupabaseAdminClient, userId: string, jornadaIds: string[]) {
  const { error: deleteError } = await admin
    .from("usuario_jornadas")
    .delete()
    .eq("usuario_id", userId);

  if (deleteError) {
    throw deleteError;
  }

  if (!Array.isArray(jornadaIds) || jornadaIds.length === 0) {
    return;
  }

  const rows = jornadaIds.map((jornadaId) => ({
    usuario_id: userId,
    jornada_id: jornadaId,
  }));

  const { error: insertError } = await admin
    .from("usuario_jornadas")
    .insert(rows);

  if (insertError) {
    throw insertError;
  }
}

async function findContactByUniqueFields(admin: SupabaseAdminClient, contactData: {
  email: string | null;
  identificacion: string | null;
}) {
  if (contactData.email) {
    const { data, error } = await admin
      .from("contactos")
      .select("id:contactos_id")
      .eq("email", contactData.email)
      .maybeSingle();

    if (error) throw error;
    if (data?.id) return data.id;
  }

  if (contactData.identificacion) {
    const { data, error } = await admin
      .from("contactos")
      .select("id:contactos_id")
      .eq("identificacion", contactData.identificacion)
      .maybeSingle();

    if (error) throw error;
    if (data?.id) return data.id;
  }

  return null;
}

async function upsertContact(
  admin: SupabaseAdminClient,
  contactData: {
    nombre: string;
    telefono: string | null;
    email: string | null;
    identificacion: string | null;
    direccion: string | null;
  },
  preferredContactId: string | null = null,
) {
  if (!contactData.nombre && !contactData.email && !contactData.telefono && !contactData.identificacion && !contactData.direccion) {
    return null;
  }

  const payload = {
    nombre: contactData.nombre || "Sin nombre",
    telefono: contactData.telefono,
    email: contactData.email,
    identificacion: contactData.identificacion,
    direccion: contactData.direccion,
  };

  if (preferredContactId) {
    const { error } = await admin
      .from("contactos")
      .update(payload)
      .eq("contactos_id", preferredContactId);

    if (error) throw error;
    return preferredContactId;
  }

  const existingId = await findContactByUniqueFields(admin, {
    email: contactData.email,
    identificacion: contactData.identificacion,
  });

  if (existingId) {
    const { error } = await admin
      .from("contactos")
      .update(payload)
      .eq("contactos_id", existingId);

    if (error) throw error;
    return existingId;
  }

  const { data: inserted, error: insertError } = await admin
    .from("contactos")
    .insert([payload])
    .select("id:contactos_id")
    .single();

  if (insertError) throw insertError;

  return inserted?.id || null;
}

async function cleanupOnFailure(admin: SupabaseAdminClient, userId?: string | null, contactoId?: string | null) {
  if (contactoId) {
    await admin.from("contactos").delete().eq("contactos_id", contactoId).catch(() => null);
  }

  if (userId) {
    await admin.from("usuarios").delete().eq("usuarios_id", userId).catch(() => null);
    await admin.from("usuario_jornadas").delete().eq("usuario_id", userId).catch(() => null);
    await admin.auth.admin.deleteUser(userId).catch(() => null);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const auth = await getAuthenticatedAdmin(req);
    if ("status" in auth) {
      return json({ error: auth.error }, auth.status);
    }

    const { admin, user } = auth;

    const requesterRole = await getRequesterRole(admin, user.id).catch((err) => {
      return null;
    });

    if (requesterRole !== "admin" && requesterRole !== "developer") {
      return json({ error: "Sin permisos" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").toLowerCase() as Action;

    if (action !== "create" && action !== "update" && action !== "delete") {
      return json({ error: "action debe ser create, update o delete" }, 400);
    }

    if (action === "create") {
      const email = extractEmail(body);
      const password = extractPassword(body);
      const nombre = extractNombre(body);
      const role = extractRole(body);
      const empresaId = extractEmpresaId(body);
      const sucursalId = extractSucursalId(body);

      if (!email || !password || !nombre) {
        return json({ error: "email, password y nombre son obligatorios" }, 400);
      }

      if (!sucursalId) {
        return json({ error: "sucursal_id es obligatorio y debe ser válido" }, 400);
      }

      if (!isUuid(sucursalId)) {
        return json({ error: "sucursal_id debe ser un UUID válido" }, 400);
      }

      const { data: sucursalRow, error: sucursalError } = await admin
        .from("sucursales")
        .select("id:sucursales_id, nombre, codigo, empresa_id")
        .eq("sucursales_id", sucursalId)
        .maybeSingle();

      if (sucursalError) {
        return json({ error: sucursalError.message }, 500);
      }

      if (!sucursalRow?.id) {
        return json({ error: "La sucursal no existe" }, 400);
      }

      if (empresaId && sucursalRow.empresa_id && String(sucursalRow.empresa_id).trim() !== empresaId) {
        return json({ error: "La sucursal no pertenece a la empresa activa" }, 400);
      }

      const contactData = getContactData(body);
      if (!contactData.nombre) {
        return json({ error: "El nombre del contacto es obligatorio" }, 400);
      }

      const jornadas = extractJornadas(body);

      const extraData = {
        nombre,
        role,
        sucursal_id: sucursalRow.id,
        empresa_id: sucursalRow.empresa_id || empresaId,
        nacimiento: body?.data?.nacimiento || body?.payload?.data?.nacimiento || null,
        identificacion: body?.data?.identificacion || body?.payload?.data?.identificacion || null,
        identificacion_nombre: body?.data?.identificacion_nombre || body?.payload?.data?.identificacion_nombre || null,
        telefono: body?.data?.telefono || body?.payload?.data?.telefono || null,
        direccion: body?.data?.direccion || body?.payload?.data?.direccion || null,
        afp: body?.data?.afp || body?.payload?.data?.afp || null,
        isss: body?.data?.isss || body?.payload?.data?.isss || null,
        descripcion: body?.data?.descripcion || body?.payload?.data?.descripcion || null,
        salario_h: body?.data?.salario_h ?? body?.payload?.data?.salario_h ?? 0,
      };

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          ...extraData,
          sucursalId: sucursalRow.id,
          empresa_id: extraData.empresa_id,
        },
      });

      if (createError || !created?.user?.id) {
        return json(
          { error: createError?.message || "No se pudo crear el usuario en Auth" },
          400,
        );
      }

      const userId = created.user.id;
      let contactoId: string | null = null;

      try {
        contactoId = await upsertContact(admin, contactData, null);

        const usuarioRow = {
          usuarios_id: userId,
          contacto_id: contactoId,
          nacimiento: extraData.nacimiento,
          identificacion_nombre: extraData.identificacion_nombre,
          afp: extraData.afp,
          isss: extraData.isss,
          descripcion: extraData.descripcion,
          salario_h: extraData.salario_h,
          role: extraData.role,
          sucursal_id: extraData.sucursal_id,
        };

        const { error: upsertError } = await admin
          .from("usuarios")
          .upsert([usuarioRow], { onConflict: "usuarios_id" });

        if (upsertError) {
          await cleanupOnFailure(admin, userId, contactoId);
          return json({ error: upsertError.message }, 400);
        }

        await replaceUserJornadas(admin, userId, jornadas).catch(async (jornadasError) => {
          await cleanupOnFailure(admin, userId, contactoId);
          throw jornadasError;
        });

        return json({
          success: true,
          action: "create",
          userId,
          contactoId,
          sucursal_id: sucursalRow.id,
        }, 200);
      } catch (err) {
        await cleanupOnFailure(admin, userId, contactoId);
        return json({ error: err?.message || "Error inesperado al crear" }, 500);
      }
    }

    if (action === "update") {
      const userId = firstNonEmpty(
        body?.userId,
        body?.id,
        body?.payload?.userId,
        body?.payload?.id,
      );

      if (!userId) {
        return json({ error: "userId es obligatorio" }, 400);
      }

      const email = extractEmail(body);
      const password = extractPassword(body);
      const nombre = extractNombre(body);
      const role = extractRole(body);
      const empresaId = extractEmpresaId(body);
      const sucursalId = extractSucursalId(body);
      const jornadas = extractJornadas(body);
      const contactData = getContactData(body);

      const { data: currentUserRow, error: currentUserError } = await admin
        .from("usuarios")
        .select("id:usuarios_id, contacto_id, sucursal_id, role")
        .eq("usuarios_id", userId)
        .maybeSingle();

      if (currentUserError) {
        return json({ error: currentUserError.message }, 400);
      }

      if (!currentUserRow?.id) {
        return json({ error: "El usuario no existe" }, 404);
      }

      const { data: authRow, error: authLookupError } = await admin.auth.admin.getUserById(userId);

      if (authLookupError || !authRow?.user) {
        return json({ error: authLookupError?.message || "No se pudo leer el usuario de Auth" }, 400);
      }

      const finalSucursalId = sucursalId && isUuid(sucursalId)
        ? sucursalId
        : String(currentUserRow.sucursal_id || "").trim();

      if (!finalSucursalId || !isUuid(finalSucursalId)) {
        return json({ error: "No se pudo determinar una sucursal válida" }, 400);
      }

      const { data: sucursalRow, error: sucursalError } = await admin
        .from("sucursales")
        .select("id:sucursales_id, nombre, codigo, empresa_id")
        .eq("sucursales_id", finalSucursalId)
        .maybeSingle();

      if (sucursalError) {
        return json({ error: sucursalError.message }, 500);
      }

      if (!sucursalRow?.id) {
        return json({ error: "La sucursal no existe" }, 400);
      }

      if (empresaId && sucursalRow.empresa_id && String(sucursalRow.empresa_id).trim() !== empresaId) {
        return json({ error: "La sucursal no pertenece a la empresa activa" }, 400);
      }

      const updatedExtraData = {
        nombre: nombre || contactData.nombre || authRow.user.email || "Empleado",
        role,
        sucursal_id: sucursalRow.id,
        empresa_id: sucursalRow.empresa_id || empresaId,
        nacimiento: body?.data?.nacimiento || body?.payload?.data?.nacimiento || null,
        identificacion: body?.data?.identificacion || body?.payload?.data?.identificacion || null,
        identificacion_nombre: body?.data?.identificacion_nombre || body?.payload?.data?.identificacion_nombre || null,
        telefono: body?.data?.telefono || body?.payload?.data?.telefono || null,
        direccion: body?.data?.direccion || body?.payload?.data?.direccion || null,
        afp: body?.data?.afp || body?.payload?.data?.afp || null,
        isss: body?.data?.isss || body?.payload?.data?.isss || null,
        descripcion: body?.data?.descripcion || body?.payload?.data?.descripcion || null,
        salario_h: body?.data?.salario_h ?? body?.payload?.data?.salario_h ?? 0,
      };

      try {
        if (email || password) {
          const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
            ...(email ? { email } : {}),
            ...(password ? { password } : {}),
            user_metadata: {
              ...authRow.user.user_metadata,
              ...updatedExtraData,
              sucursalId: sucursalRow.id,
              empresa_id: updatedExtraData.empresa_id,
            },
          });

          if (authUpdateError) {
            return json({ error: authUpdateError.message }, 400);
          }
        }

        const contactoId = await upsertContact(admin, contactData, currentUserRow.contacto_id || null);

        const usuarioRow = {
          usuarios_id: userId,
          contacto_id: contactoId,
          nacimiento: updatedExtraData.nacimiento,
          identificacion_nombre: updatedExtraData.identificacion_nombre,
          afp: updatedExtraData.afp,
          isss: updatedExtraData.isss,
          descripcion: updatedExtraData.descripcion,
          salario_h: updatedExtraData.salario_h,
          role: updatedExtraData.role,
          sucursal_id: updatedExtraData.sucursal_id,
        };

        const { error: upsertError } = await admin
          .from("usuarios")
          .upsert([usuarioRow], { onConflict: "usuarios_id" });

        if (upsertError) {
          return json({ error: upsertError.message }, 400);
        }

        if (Array.isArray(body?.jornadas) || Array.isArray(body?.payload?.jornadas)) {
          await replaceUserJornadas(admin, userId, jornadas);
        }

        return json({
          success: true,
          action: "update",
          userId,
          contactoId: usuarioRow.contacto_id,
          sucursal_id: sucursalRow.id,
        }, 200);
      } catch (err) {
        return json({ error: err?.message || "Error inesperado al actualizar" }, 500);
      }
    }

    const userId = firstNonEmpty(
      body?.userId,
      body?.id,
      body?.payload?.userId,
      body?.payload?.id,
    );

    if (!userId) {
      return json({ error: "userId es obligatorio" }, 400);
    }

    const { data: usuarioActual, error: usuarioActualError } = await admin
      .from("usuarios")
      .select("id:usuarios_id, contacto_id")
      .eq("usuarios_id", userId)
      .maybeSingle();

    if (usuarioActualError) {
      return json({ error: usuarioActualError.message }, 400);
    }

    const contactoId = usuarioActual?.contacto_id || null;

    const { error: jornadasError } = await admin
      .from("usuario_jornadas")
      .delete()
      .eq("usuario_id", userId);

    if (jornadasError) {
      return json({ error: jornadasError.message }, 400);
    }

    const { error: usuarioError } = await admin
      .from("usuarios")
      .delete()
      .eq("usuarios_id", userId);

    if (usuarioError) {
      return json({ error: usuarioError.message }, 400);
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      return json({ error: authDeleteError.message }, 400);
    }

    if (contactoId) {
      await admin
        .from("contactos")
        .delete()
        .eq("contactos_id", contactoId)
        .catch(() => null);
    }

    return json({ success: true, action: "delete", userId }, 200);
  } catch (err) {
    return json({ error: err?.message || "Error inesperado" }, 500);
  }
});
