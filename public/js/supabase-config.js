// js/supabase-config.js

(function (global) {

    const SUPABASE_URL = "https://eblwytlplcoemaldlefb.supabase.co";

    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVibHd5dGxwbGNvZW1hbGRsZWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTEwNDYsImV4cCI6MjA4NzI4NzA0Nn0.Q5PryPfmSINATxgKEDXVpyTtB2oFCRwjp1UX2OMq41E";

    const supabase = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );

    global.supabase = supabase;

})(window);