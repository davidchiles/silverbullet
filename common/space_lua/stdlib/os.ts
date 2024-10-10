import { LuaBuiltinFunction, LuaTable } from "$common/space_lua/runtime.ts";

export const osApi = new LuaTable({
    time: new LuaBuiltinFunction((tbl?: LuaTable) => {
        if (tbl) {
            // Build a date object from the table
            const date = new Date();
            if (!tbl.has("year")) {
                throw new Error("time(): year is required");
            }
            date.setFullYear(tbl.get("year"));
            if (!tbl.has("month")) {
                throw new Error("time(): month is required");
            }
            date.setMonth(tbl.get("month") - 1);
            if (!tbl.has("day")) {
                throw new Error("time(): day is required");
            }
            date.setDate(tbl.get("day"));
            date.setHours(tbl.get("hour") ?? 12);
            date.setMinutes(tbl.get("min") ?? 0);
            date.setSeconds(tbl.get("sec") ?? 0);
            return Math.floor(date.getTime() / 1000);
        } else {
            return Math.floor(Date.now() / 1000);
        }
    }),
    /**
     * Returns a string or a table containing date and time, formatted according to the given string format.
     * If the time argument is present, this is the time to be formatted (see the os.time function for a description of this value). Otherwise, date formats the current time.
     * If format starts with '!', then the date is formatted in Coordinated Universal Time. After this optional character, if format is the string "*t", then date returns a table with the following fields: year, month (1–12), day (1–31), hour (0–23), min (0–59), sec (0–61, due to leap seconds), wday (weekday, 1–7, Sunday is 1), yday (day of the year, 1–366), and isdst (daylight saving flag, a boolean). This last field may be absent if the information is not available.
     * If format is not "*t", then date returns the date as a string, formatted according to the same rules as the ISO C function strftime.
     * If format is absent, it defaults to "%c", which gives a human-readable date and time representation using the current locale.
     */
    date: new LuaBuiltinFunction((format: string, timestamp?: number) => {
        const date = timestamp ? new Date(timestamp * 1000) : new Date();

        // Default Lua-like format when no format string is provided
        if (!format) {
            return date.toDateString() + " " + date.toLocaleTimeString();
        }

        // Define mappings for Lua-style placeholders
        const formatMap: { [key: string]: () => string } = {
            // Year
            "%Y": () => date.getFullYear().toString(),
            "%y": () => (date.getFullYear() % 100).toString().padStart(2, "0"),
            // Month
            "%m": () => (date.getMonth() + 1).toString().padStart(2, "0"),
            "%b": () => date.toLocaleString("en-US", { month: "short" }),
            "%B": () => date.toLocaleString("en-US", { month: "long" }),
            // Day
            "%d": () => date.getDate().toString().padStart(2, "0"),
            "%e": () => date.getDate().toString(),
            // Hour
            "%H": () => date.getHours().toString().padStart(2, "0"),
            "%I": () =>
                (date.getHours() % 12 || 12).toString().padStart(2, "0"),
            // Minute
            "%M": () => date.getMinutes().toString().padStart(2, "0"),
            // Second
            "%S": () => date.getSeconds().toString().padStart(2, "0"),
            // AM/PM
            "%p": () => date.getHours() >= 12 ? "PM" : "AM",
            // Day of the week
            "%A": () => date.toLocaleString("en-US", { weekday: "long" }),
            "%a": () => date.toLocaleString("en-US", { weekday: "short" }),
            "%w": () => date.getDay().toString(),
            // Day of the year
            "%j": () => {
                const start = new Date(date.getFullYear(), 0, 0);
                const diff = date.getTime() - start.getTime();
                const oneDay = 1000 * 60 * 60 * 24;
                const dayOfYear = Math.floor(diff / oneDay);
                return dayOfYear.toString().padStart(3, "0");
            },
            // Time zone
            "%Z": () => {
                const match = date.toTimeString().match(/\((.*)\)/);
                return match ? match[1] : "";
            },
            "%z": () => {
                const offset = -date.getTimezoneOffset();
                const sign = offset >= 0 ? "+" : "-";
                const absOffset = Math.abs(offset);
                const hours = Math.floor(absOffset / 60).toString().padStart(
                    2,
                    "0",
                );
                const minutes = (absOffset % 60).toString().padStart(2, "0");
                return `${sign}${hours}${minutes}`;
            },
            // Literal %
            "%%": () => "%",
        };

        // Replace format placeholders with corresponding values
        return format.replace(/%[A-Za-z%]/g, (match) => {
            const formatter = formatMap[match];
            return formatter ? formatter() : match;
        });
    }),
});