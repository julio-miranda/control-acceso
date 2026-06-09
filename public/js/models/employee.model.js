// js/models/employee.model.js
(function (global) {
  const state = {
    allowedLat: null,
    allowedLng: null,
    currentSucursalId: null
  };

  function getSupabase() {
    if (!global.supabase) {
      throw new Error("Supabase no está inicializado.");
    }
    return global.supabase;
  }

  async function getUserData(uid) {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .eq("id", uid)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function getUserJornadas(uid) {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("usuario_jornadas")
      .select("jornada_id, jornadas(*)")
      .eq("usuario_id", uid);

    if (error) throw error;
    return data || [];
  }

  function getAllowedPoint() {
    return {
      lat: state.allowedLat,
      lng: state.allowedLng
    };
  }

  function getCurrentSucursalId() {
    return state.currentSucursalId;
  }

  function setCurrentSucursalId(id) {
    state.currentSucursalId = id;
  }

  async function findEmpresaByQr(decoded) {
    const supabase = getSupabase();
    const qr = (decoded || "").trim();
    if (!qr) return null;

    let { data: empresa, error } = await supabase
      .from("empresa")
      .select("*")
      .eq("id", qr)
      .maybeSingle();

    if (error) {
      console.warn("Error buscando empresa por id:", error);
    }

    if (empresa) return empresa;

    ({ data: empresa, error } = await supabase
      .from("empresa")
      .select("*")
      .eq("nombre", qr)
      .maybeSingle());

    if (error) {
      console.warn("Error buscando empresa exacta por nombre:", error);
    }

    if (empresa) return empresa;

    ({ data: empresa, error } = await supabase
      .from("empresa")
      .select("*")
      .ilike("nombre", `%${qr}%`)
      .maybeSingle());

    if (error) {
      console.warn("Error buscando empresa por like:", error);
    }

    return empresa || null;
  }

  function distanceMeters(lat1, lon1, lat2, lon2) {
    const toRad = deg => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async function ensureCoordsForEmpresaSucursal(empresa, user, coords) {
    const supabase = getSupabase();
    state.currentSucursalId = null;

    try {
      let sucursal = null;

      if (user && user.sucursal_id) {
        const { data: suc, error: sucErr } = await supabase
          .from("sucursales")
          .select("*")
          .eq("id", user.sucursal_id)
          .maybeSingle();

        if (sucErr) console.warn("Error buscando sucursal por id:", sucErr);
        if (suc) sucursal = suc;
      }

      if (!sucursal && user && (user.sucursal || user.sucursal === 0)) {
        const codigo = String(user.sucursal);
        const { data: sucList, error: sucCodeErr } = await supabase
          .from("sucursales")
          .select("*")
          .eq("empresa_id", empresa?.id || "UNICA_EMPRESA")
          .eq("codigo", codigo)
          .limit(1);

        if (sucCodeErr) console.warn("Error buscando sucursal por codigo:", sucCodeErr);
        if (Array.isArray(sucList) && sucList.length) sucursal = sucList[0];
      }

      if (sucursal) {
        state.currentSucursalId = sucursal.id;

        const latExists = sucursal.lat !== null && sucursal.lat !== undefined && sucursal.lat !== "";
        const lngExists = sucursal.lng !== null && sucursal.lng !== undefined && sucursal.lng !== "";

        if (latExists && lngExists) {
          state.allowedLat = parseFloat(sucursal.lat);
          state.allowedLng = parseFloat(sucursal.lng);
          return {
            updated: false,
            lat: state.allowedLat,
            lng: state.allowedLng,
            source: "sucursal",
            sucursal_id: sucursal.id
          };
        }

        try {
          const { error: upErr } = await supabase
            .from("sucursales")
            .update({ lat: coords.lat, lng: coords.lng })
            .eq("id", sucursal.id);

          if (upErr) {
            console.warn("No se pudo actualizar coordenadas de la sucursal:", upErr);
            state.allowedLat = coords.lat;
            state.allowedLng = coords.lng;
            return {
              updated: false,
              lat: coords.lat,
              lng: coords.lng,
              source: "local",
              sucursal_id: sucursal.id
            };
          }

          state.allowedLat = coords.lat;
          state.allowedLng = coords.lng;
          return {
            updated: true,
            lat: coords.lat,
            lng: coords.lng,
            source: "sucursal",
            sucursal_id: sucursal.id
          };
        } catch (e) {
          console.error("Error actualizando sucursal:", e);
          state.allowedLat = coords.lat;
          state.allowedLng = coords.lng;
          return {
            updated: false,
            lat: coords.lat,
            lng: coords.lng,
            source: "local",
            sucursal_id: sucursal.id
          };
        }
      }

      state.allowedLat = coords.lat;
      state.allowedLng = coords.lng;
      return {
        updated: false,
        lat: coords.lat,
        lng: coords.lng,
        source: "local",
        sucursal_id: null
      };
    } catch (e) {
      console.error("Error en ensureCoordsForEmpresaSucursal:", e);
      state.allowedLat = coords.lat;
      state.allowedLng = coords.lng;
      return {
        updated: false,
        lat: coords.lat,
        lng: coords.lng,
        source: "local",
        sucursal_id: null
      };
    }
  }

  async function registrarAsistencia(uid, jornada, userParam, getJustificationFn) {
    const supabase = getSupabase();
    const user = userParam || await getUserData(uid);
    const now = new Date();
    const fecha = now.toISOString().split("T")[0];
    const horaActual = now.toTimeString().split(" ")[0];

    const { data: existente, error: existErr } = await supabase
      .from("asistencias")
      .select("*")
      .eq("usuario_id", uid)
      .eq("fecha", fecha)
      .maybeSingle();

    if (existErr) {
      console.error("Error consultando asistencia existente:", existErr);
      return {
        ok: false,
        message: "Error al consultar tu asistencia. Intenta de nuevo."
      };
    }

    if (!existente) {
      let status = "Presente";

      if (jornada && jornada.hora_entrada && horaActual > jornada.hora_entrada) {
        status = "Tarde";

        let justificacion = "";
        if (typeof getJustificationFn === "function") {
          justificacion = await getJustificationFn();
        }

        if (!justificacion) {
          return {
            ok: false,
            message: "Debes justificar tu llegada tarde."
          };
        }

        const { data: insData, error: insErr } = await supabase
          .from("asistencias")
          .insert({
            usuario_id: uid,
            jornada_id: jornada.id,
            fecha,
            entrada_time: horaActual,
            status,
            justificacion
          })
          .select()
          .maybeSingle();

        if (insErr) {
          console.error("Error insertando asistencia (entrada tarde):", insErr);
          return {
            ok: false,
            message: "No se pudo registrar la entrada. Revisa la consola."
          };
        }

        return {
          ok: true,
          tipo: "entrada",
          status,
          data: insData,
          message: "Entrada registrada correctamente."
        };
      }

      const { data: insData, error: insErr } = await supabase
        .from("asistencias")
        .insert({
          usuario_id: uid,
          jornada_id: jornada ? jornada.id : null,
          fecha,
          entrada_time: horaActual,
          status
        })
        .select()
        .maybeSingle();

      if (insErr) {
        console.error("Error insertando asistencia (entrada):", insErr);
        return {
          ok: false,
          message: "No se pudo registrar la entrada. Revisa la consola."
        };
      }

      return {
        ok: true,
        tipo: "entrada",
        status,
        data: insData,
        message: "Entrada registrada correctamente."
      };
    }

    const { data: upd, error: updErr } = await supabase
      .from("asistencias")
      .update({ salida_time: horaActual })
      .eq("id", existente.id)
      .select()
      .maybeSingle();

    if (updErr) {
      console.error("Error actualizando salida:", updErr);
      return {
        ok: false,
        message: "No se pudo registrar la salida. Revisa la consola."
      };
    }

    return {
      ok: true,
      tipo: "salida",
      data: upd,
      message: "Salida registrada correctamente."
    };
  }

  global.EmployeeModel = {
    getUserData,
    getUserJornadas,
    findEmpresaByQr,
    distanceMeters,
    ensureCoordsForEmpresaSucursal,
    registrarAsistencia,
    getAllowedPoint,
    getCurrentSucursalId,
    setCurrentSucursalId
  };
})(window);