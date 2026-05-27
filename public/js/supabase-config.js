// js/supabase-config.js

(function (global) {

    const SUPABASE_URL = "https://eblwytlplcoemaldlefb.supabase.co";

    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVibHd5dGxwbGNvZW1hbGRsZWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTEwNDYsImV4cCI6MjA4NzI4NzA0Nn0.Q5PryPfmSINATxgKEDXVpyTtB2oFCRwjp1UX2OMq41E";

    const supabase = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );

    const ID_COLUMNS = {
        asistencias: "asistencias_id",
        clientes_vip: "clientes_vip_id",
        contactos: "contactos_id",
        empresa: "empresa_id",
        eventos: "eventos_id",
        jornadas: "jornadas_id",
        mesas: "mesas_id",
        movimientos_stock_base: "movimientos_stock_base_id",
        productos: "productos_id",
        productos_insumo: "productos_insumo_id",
        productos_preparados: "productos_preparados_id",
        receta_detalle: "receta_detalle_id",
        recetas: "recetas_id",
        reservaciones_mesas: "reservaciones_mesas_id",
        satisfaccion_encuestas: "satisfaccion_encuestas_id",
        sucursales: "sucursales_id",
        usuarios: "usuarios_id",
        venta_detalle: "venta_detalle_id",
        ventas: "ventas_id"
    };

    function idColumnFor(table) {
        return ID_COLUMNS[String(table || "")] || null;
    }

    function mapColumn(table, column) {
        const idColumn = idColumnFor(table);
        return idColumn && column === "id" ? idColumn : column;
    }

    function splitTopLevelSelect(select) {
        const parts = [];
        let current = "";
        let depth = 0;

        for (const ch of String(select || "")) {
            if (ch === "(") depth += 1;
            if (ch === ")") depth = Math.max(0, depth - 1);

            if (ch === "," && depth === 0) {
                parts.push(current.trim());
                current = "";
            } else {
                current += ch;
            }
        }

        if (current.trim()) parts.push(current.trim());
        return parts;
    }

    function rewriteSelect(table, columns) {
        const idColumn = idColumnFor(table);
        if (!idColumn) return columns;

        const select = String(columns || "*").trim() || "*";
        const parts = splitTopLevelSelect(select);
        let hasIdAlias = false;

        const rewritten = parts.map((part) => {
            if (/^id\s*:/.test(part)) {
                hasIdAlias = true;
                return part;
            }

            if (part === "id") {
                hasIdAlias = true;
                return `id:${idColumn}`;
            }

            return part;
        });

        if (!hasIdAlias) {
            rewritten.unshift(`id:${idColumn}`);
        }

        return rewritten.join(",");
    }

    function rewritePayload(table, payload) {
        const idColumn = idColumnFor(table);
        if (!idColumn || !payload) return payload;

        if (Array.isArray(payload)) {
            return payload.map((row) => rewritePayload(table, row));
        }

        if (typeof payload !== "object") return payload;

        const row = { ...payload };
        if (Object.prototype.hasOwnProperty.call(row, "id")) {
            if (!Object.prototype.hasOwnProperty.call(row, idColumn)) {
                row[idColumn] = row.id;
            }
            delete row.id;
        }

        return row;
    }

    function rewriteOptions(table, options) {
        const idColumn = idColumnFor(table);
        if (!idColumn || !options || typeof options !== "object") return options;

        const next = { ...options };
        if (typeof next.onConflict === "string") {
            next.onConflict = next.onConflict
                .split(",")
                .map((column) => mapColumn(table, column.trim()))
                .join(",");
        }

        return next;
    }

    function patchBuilder(builder, table) {
        if (!builder || builder.__idColumnPatched) return builder;

        Object.defineProperty(builder, "__idColumnPatched", {
            value: true,
            enumerable: false
        });

        if (typeof builder.select === "function") {
            const originalSelect = builder.select;
            builder.select = function (columns, ...args) {
                return patchBuilder(originalSelect.call(this, rewriteSelect(table, columns), ...args), table);
            };
        }

        for (const method of ["insert", "update", "upsert"]) {
            if (typeof builder[method] !== "function") continue;

            const originalMethod = builder[method];
            builder[method] = function (payload, options, ...args) {
                return patchBuilder(
                    originalMethod.call(this, rewritePayload(table, payload), rewriteOptions(table, options), ...args),
                    table
                );
            };
        }

        if (typeof builder.delete === "function") {
            const originalDelete = builder.delete;
            builder.delete = function (options, ...args) {
                return patchBuilder(originalDelete.call(this, rewriteOptions(table, options), ...args), table);
            };
        }

        for (const method of ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains", "containedBy", "overlaps", "textSearch", "not", "filter", "order"]) {
            if (typeof builder[method] !== "function") continue;

            const originalMethod = builder[method];
            builder[method] = function (column, ...args) {
                return patchBuilder(originalMethod.call(this, mapColumn(table, column), ...args), table);
            };
        }

        if (typeof builder.match === "function") {
            const originalMatch = builder.match;
            builder.match = function (query, ...args) {
                const mapped = {};
                for (const [key, value] of Object.entries(query || {})) {
                    mapped[mapColumn(table, key)] = value;
                }
                return patchBuilder(originalMatch.call(this, mapped, ...args), table);
            };
        }

        return builder;
    }

    const originalFrom = supabase.from.bind(supabase);
    supabase.from = function (table) {
        return patchBuilder(originalFrom(table), table);
    };

    global.supabase = supabase;

})(window);
