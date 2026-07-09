#!/usr/bin/env bash
set -euo pipefail

SRC="${1:?TIC-80 source root}"

EMBED_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cp "${EMBED_DIR}/embed_api.c" "${EMBED_DIR}/embed_api.h" "${SRC}/src/system/sdl/"

python3 - "${SRC}" <<'PY'
import pathlib
import re
import sys

src = pathlib.Path(sys.argv[1])

# --- CMake option (root CMakeLists always exists) ---
cmake_root = src / "CMakeLists.txt"
root_text = cmake_root.read_text()
if "TIC80_EMBED_API" not in root_text:
    root_text = root_text.replace(
        'option(BUILD_PRO "Build PRO version" FALSE)',
        'option(BUILD_PRO "Build PRO version" FALSE)\noption(TIC80_EMBED_API "TIC-80 Web Editor embed API for browser" OFF)',
    )
    cmake_root.write_text(root_text)

# --- SDL target source + emscripten link flags ---
sdl_cmake = src / "cmake" / "sdl.cmake"
cmake_target = sdl_cmake if sdl_cmake.exists() else cmake_root
cmake_text = cmake_target.read_text()

if "embed_api.c" not in cmake_text:
    cmake_text = re.sub(
        r"set\(TIC80_SRC src/system/sdl/main\.c\)",
        "set(TIC80_SRC src/system/sdl/main.c src/system/sdl/embed_api.c)",
        cmake_text,
        count=1,
    )

if "target_compile_definitions(tic80 PRIVATE TIC80_EMBED_API=1)" not in cmake_text and "target_compile_definitions(${TIC80_TARGET} PRIVATE TIC80_EMBED_API=1)" not in cmake_text:
    export_suffix = (
        " -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','lengthBytesUTF8',"
        "'stringToUTF8','HEAPU8'] -s EXPORTED_FUNCTIONS=['_main','_tic80_cart_export',"
        "'_tic80_cart_import','_tic80_cart_changed','_tic80_get_script_ext','_malloc','_free']"
    )

    target = "${TIC80_TARGET}" if "${TIC80_TARGET}" in cmake_text else "tic80"
    target_re = re.escape(target)

    em_block = re.search(
        rf" if\(EMSCRIPTEN\)\s*\n\s*set_target_properties\({target_re} PROPERTIES LINK_FLAGS \"-s WASM=1.*?\"\)\s*\n\s*set\(CMAKE_C_FLAGS \"\$\{{CMAKE_C_FLAGS\}} -s USE_SDL=2\"\)\s*\n(?:\s*\n\s*if\(CMAKE_BUILD_TYPE STREQUAL \"Debug\"\)\s*\n\s*set\(CMAKE_C_FLAGS \"\$\{{CMAKE_C_FLAGS\}} -s ASSERTIONS=1\"\)\s*\n\s*endif\(\)\s*\n)?\s*elseif\(NOT ANDROID\)",
        cmake_text,
        re.DOTALL,
    )

    replacement = f""" if(EMSCRIPTEN)
  set(EM_LINK_FLAGS "-s WASM=1 -s USE_SDL=2 -s ALLOW_MEMORY_GROWTH=1 -s FETCH=1 --pre-js ${{CMAKE_SOURCE_DIR}}/build/html/prejs.js -lidbfs.js")
  if(TIC80_EMBED_API)
   target_compile_definitions({target} PRIVATE TIC80_EMBED_API=1)
   set(EM_LINK_FLAGS "${{EM_LINK_FLAGS}}{export_suffix}")
  endif()
  set_target_properties({target} PROPERTIES LINK_FLAGS "${{EM_LINK_FLAGS}}")
  set(CMAKE_C_FLAGS "${{CMAKE_C_FLAGS}} -s USE_SDL=2")

  if(CMAKE_BUILD_TYPE STREQUAL "Debug")
  set(CMAKE_C_FLAGS "${{CMAKE_C_FLAGS}} -s ASSERTIONS=1")
  endif()

 elseif(NOT ANDROID)"""

    if em_block:
        cmake_text = cmake_text[: em_block.start()] + replacement + cmake_text[em_block.end() :]
    else:
        raise SystemExit("Could not locate EMSCRIPTEN link block in CMake files")

cmake_target.write_text(cmake_text)

# --- studio.cmake: embed hooks live in tic80studio, not the sdl executable ---
studio_cmake = src / "cmake" / "studio.cmake"
studio_text = studio_cmake.read_text()
if "target_compile_definitions(tic80studio PRIVATE TIC80_EMBED_API=1)" not in studio_text:
    studio_text = studio_text.rstrip() + """

if(TIC80_EMBED_API)
    target_compile_definitions(tic80studio PRIVATE TIC80_EMBED_API=1)
endif()
"""
    studio_cmake.write_text(studio_text + "\n")

# --- main.c ---
main_c = (src / "src/system/sdl/main.c").read_text()
if "embed_api.h" not in main_c:
    main_c = main_c.replace(
        "#if defined(__EMSCRIPTEN__)\n#include <emscripten.h>\n#endif",
        "#if defined(__EMSCRIPTEN__)\n#include <emscripten.h>\n#endif\n\n#if defined(TIC80_EMBED_API)\n#include \"embed_api.h\"\n#endif",
        1,
    )
if "tic80_embed_set_studio" not in main_c:
    marker = "platform.studio = studio_create("
    idx = main_c.find(marker)
    if idx < 0:
        raise SystemExit("Could not locate studio_create assignment in main.c")
    line_end = main_c.find(";\n", idx)
    if line_end < 0:
        raise SystemExit("Could not locate end of studio_create assignment in main.c")
    line = main_c[idx:line_end + 1]
    main_c = main_c.replace(
        line,
        line
        + "\n\n#if defined(TIC80_EMBED_API)\n    tic80_embed_set_studio(platform.studio);\n#endif",
        1,
    )
    (src / "src/system/sdl/main.c").write_text(main_c)

# --- studio.c ---
studio_c_path = src / "src/studio/studio.c"
studio_c = studio_c_path.read_text()
if "embed_api.h" not in studio_c:
    studio_c = studio_c.replace(
        '#include "studio.h"',
        '#include "studio.h"\n\n#if defined(TIC80_EMBED_API)\n#include "system/sdl/embed_api.h"\n#endif',
        1,
    )
if "TIC80_EMBED_CART_LOADED" not in studio_c:
    studio_c = re.sub(
        r"void studioRomLoaded\(Studio\* studio\)\s*\{([^}]*updateMDate\(studio\);\s*)\}",
        r"void studioRomLoaded(Studio* studio)\n{\1\n#if defined(TIC80_EMBED_API)\n    tic80_embed_notify(TIC80_EMBED_CART_LOADED);\n#endif\n}",
        studio_c,
        count=1,
        flags=re.DOTALL,
    )
    studio_c = re.sub(
        r"void studioRomSaved\(Studio\* studio\)\s*\{([^}]*updateMDate\(studio\);\s*)\}",
        r"void studioRomSaved(Studio* studio)\n{\1\n#if defined(TIC80_EMBED_API)\n    tic80_embed_notify(TIC80_EMBED_CART_SAVED);\n#endif\n}",
        studio_c,
        count=1,
        flags=re.DOTALL,
    )
    studio_c = re.sub(
        r"(#if defined\(BUILD_EDITORS\)\s*switch\(mode\)\s*\{[\s\S]*?studio->mode = mode;\s*)#else",
        r"\1\n#if defined(TIC80_EMBED_API)\n        if(mode == TIC_CONSOLE_MODE && prev != mode && prev != TIC_CONSOLE_MODE && prev != TIC_START_MODE && prev != TIC_RUN_MODE)\n            tic80_embed_notify(TIC80_EMBED_CART_UPDATED);\n#endif\n#else",
        studio_c,
        count=1,
    )

if "TIC80_EMBED_BLOCK_CODE_MODE" not in studio_c:
    studio_c = studio_c.replace(
        "void setStudioMode(Studio* studio, EditorMode mode)\n{\n    if(mode != studio->mode)",
        """void setStudioMode(Studio* studio, EditorMode mode)
{
#if defined(TIC80_EMBED_API)
    if(mode == TIC_CODE_MODE)
    {
        tic80_embed_notify(TIC80_EMBED_EDIT_REQUESTED);
        return; /* TIC80_EMBED_BLOCK_CODE_MODE */
    }
#endif
    if(mode != studio->mode)""",
        1,
    )

if "TIC80_EMBED_GOTO_CODE" not in studio_c:
    studio_c = studio_c.replace(
        "void gotoCode(Studio* studio)\n{\n    setStudioMode(studio, TIC_CODE_MODE);\n}",
        """void gotoCode(Studio* studio)
{
#if defined(TIC80_EMBED_API)
    tic80_embed_notify(TIC80_EMBED_EDIT_REQUESTED);
#else
    setStudioMode(studio, TIC_CODE_MODE);
#endif
} /* TIC80_EMBED_GOTO_CODE */""",
        1,
    )

modes_old = """static const EditorMode Modes[] =
{
    TIC_CODE_MODE,
    TIC_SPRITE_MODE,
    TIC_MAP_MODE,
    TIC_SFX_MODE,
    TIC_MUSIC_MODE,
};"""
modes_new = """static const EditorMode Modes[] =
{
#if !defined(TIC80_EMBED_API)
    TIC_CODE_MODE,
#endif
    TIC_SPRITE_MODE,
    TIC_MAP_MODE,
    TIC_SFX_MODE,
    TIC_MUSIC_MODE,
}; /* TIC80_EMBED_MODES */"""
if "TIC80_EMBED_MODES" not in studio_c:
    if modes_old in studio_c:
        studio_c = studio_c.replace(modes_old, modes_new, 1)
    else:
        raise SystemExit("Could not locate Modes[] in studio.c")

toolbar_old = """    static const u8 Icons[] = {tic_icon_code, tic_icon_sprite, tic_icon_map, tic_icon_sfx, tic_icon_music};
    static const char* Tips[] = {"CODE EDITOR [f1]", "SPRITE EDITOR [f2]", "MAP EDITOR [f3]", "SFX EDITOR [f4]", "MUSIC EDITOR [f5]",};"""
toolbar_new = """#if defined(TIC80_EMBED_API)
    static const u8 Icons[] = {tic_icon_sprite, tic_icon_map, tic_icon_sfx, tic_icon_music};
    static const char* Tips[] = {"SPRITE EDITOR [f2]", "MAP EDITOR [f3]", "SFX EDITOR [f4]", "MUSIC EDITOR [f5]",};
#else
    static const u8 Icons[] = {tic_icon_code, tic_icon_sprite, tic_icon_map, tic_icon_sfx, tic_icon_music};
    static const char* Tips[] = {"CODE EDITOR [f1]", "SPRITE EDITOR [f2]", "MAP EDITOR [f3]", "SFX EDITOR [f4]", "MUSIC EDITOR [f5]",};
#endif /* TIC80_EMBED_TOOLBAR */"""
if "TIC80_EMBED_TOOLBAR" not in studio_c:
    if toolbar_old in studio_c:
        studio_c = studio_c.replace(toolbar_old, toolbar_new, 1)
    else:
        raise SystemExit("Could not locate toolbar Icons/Tips in studio.c")

names_old = """    static const char* Names[] =
    {
        "CODE EDITOR",
        "SPRITE EDITOR",
        "MAP EDITOR",
        "SFX EDITOR",
        "MUSIC EDITOR",
    };"""
names_new = """#if defined(TIC80_EMBED_API)
    static const char* Names[] =
    {
        "SPRITE EDITOR",
        "MAP EDITOR",
        "SFX EDITOR",
        "MUSIC EDITOR",
    };
#else
    static const char* Names[] =
    {
        "CODE EDITOR",
        "SPRITE EDITOR",
        "MAP EDITOR",
        "SFX EDITOR",
        "MUSIC EDITOR",
    };
#endif /* TIC80_EMBED_NAMES */"""
if "TIC80_EMBED_NAMES" not in studio_c:
    if names_old in studio_c:
        studio_c = studio_c.replace(names_old, names_new, 1)
    else:
        raise SystemExit("Could not locate toolbar Names[] in studio.c")

studio_c_path.write_text(studio_c)

# --- console.c ---
console_c_path = src / "src/studio/screens/console.c"
console_c = console_c_path.read_text()
if "embed_api.h" not in console_c:
    if "#if defined(__EMSCRIPTEN__)\n#include <emscripten.h>\n#endif" in console_c:
        console_c = console_c.replace(
            "#if defined(__EMSCRIPTEN__)\n#include <emscripten.h>\n#endif",
            "#if defined(__EMSCRIPTEN__)\n#include <emscripten.h>\n#endif\n\n#if defined(TIC80_EMBED_API)\n#include \"system/sdl/embed_api.h\"\n#endif",
            1,
        )
    else:
        console_c = console_c.replace(
            '#include "studio/project.h"',
            '#include "studio/project.h"\n\n#if defined(TIC80_EMBED_API)\n#include "system/sdl/embed_api.h"\n#endif',
            1,
        )
if "TIC80_EMBED_EDIT_REQUESTED" not in console_c:
    console_c = re.sub(
        r"static void onEditCommand\(Console\* console\)\s*\{\s*gotoCode\(console->studio\);\s*commandDone\(console\);\s*\}",
        """static void onEditCommand(Console* console)
{
#if defined(TIC80_EMBED_API)
    tic80_embed_notify(TIC80_EMBED_EDIT_REQUESTED);
#else
    gotoCode(console->studio);
#endif
    commandDone(console);
}""",
        console_c,
        count=1,
    )
    console_c_path.write_text(console_c)

if "TIC80_EMBED_BOOT_DEMO" not in console_c:
    boot_demo_old = (
        "            loadDemo(console, tic_get_script(tic));\n\n"
        "            if(!console->args.cli)"
    )
    boot_demo_new = (
        "            loadDemo(console, tic_get_script(tic));\n"
        "#if defined(TIC80_EMBED_API)\n"
        "            studioRomLoaded(console->studio);\n"
        "#endif\n"
        "            /* TIC80_EMBED_BOOT_DEMO */\n\n"
        "            if(!console->args.cli)"
    )
    if boot_demo_old in console_c:
        console_c = console_c.replace(boot_demo_old, boot_demo_new, 1)
        console_c_path.write_text(console_c)

# --- console.c: `studio` command opens the visual editors ---
console_c = console_c_path.read_text()
if "onStudioCommand" not in console_c:
    console_c = console_c.replace(
        "static void onEditCommand(Console* console)",
        """static void onStudioCommand(Console* console)
{
    setStudioMode(console->studio, TIC_SPRITE_MODE);
#if defined(TIC80_EMBED_API)
    tic80_embed_notify(TIC80_EMBED_STUDIO_REQUESTED);
#endif
    commandDone(console);
}

static void onEditCommand(Console* console)""",
        1,
    )

    new_console_c, n = re.subn(
        r'(macro\("edit",\s*\\\s*\n\s*NULL,\s*\\\s*\n\s*"Open cart editors[^"]*",\s*\\\s*\n\s*NULL,\s*\\\s*\n\s*onEditCommand,\s*\\\s*\n\s*NULL,\s*\\\s*\n\s*NULL\)\s*\\\s*\n)',
        r'\1 \\\n    macro("studio", \\\n        NULL, \\\n        "Open the visual editors (sprite, map, sfx, music).", \\\n        NULL, \\\n        onStudioCommand, \\\n        NULL, \\\n        NULL) \\\n',
        console_c,
        count=1,
    )
    if n == 0:
        raise SystemExit("Could not locate edit command entry in console.c COMMANDS_LIST")
    console_c = new_console_c
    console_c_path.write_text(console_c)

# --- ext/history.c: notify on committed resource edits ---
history_c_path = src / "src/ext/history.c"
history_c = history_c_path.read_text()
if "embed_api.h" not in history_c:
    history_c = history_c.replace(
        '#include "history.h"',
        '#include "history.h"\n\n#if defined(TIC80_EMBED_API)\n#include "system/sdl/embed_api.h"\n#endif',
        1,
    )
if "TIC80_EMBED_HISTORY_NOTIFY" not in history_c:
    new_history_c, n = re.subn(
        r"(bool history_add\(History\* history\)\s*\{.*?memcpy\(history->state, history->data, history->size\);\s*\n\s*)return true;",
        "\\1#if defined(TIC80_EMBED_API)\n    tic80_embed_notify(TIC80_EMBED_CART_UPDATED);\n#endif\n    /* TIC80_EMBED_HISTORY_NOTIFY */\n    return true;",
        history_c,
        count=1,
        flags=re.DOTALL,
    )
    if n == 0:
        raise SystemExit("Could not locate history_add return true in history.c")
    history_c = new_history_c
history_c_path.write_text(history_c)

# --- studio.c: Escape opens the in-game menu; disable Ctrl+Q quit ---
studio_c = studio_c_path.read_text()

if "TIC80_EMBED_ESC_MENU" not in studio_c:
    # In the BUILD_EDITORS Escape handler, RUN/MENU modes only open the menu when
    # the cart defines its own game-menu tag, otherwise they exit the game (which
    # bounces focus back into the host editor). Make them behave like the web
    # player build: Escape always opens/closes the in-game menu.
    studio_c, n_menu = re.subn(
        r"case TIC_MENU_MODE:\s*showGameMenu\(studio\)\s*\?\s*studio_menu_back\(studio->menu\)\s*:\s*setStudioMode\(studio,\s*studio->prevMode\s*==\s*TIC_RUN_MODE\s*\?\s*TIC_CONSOLE_MODE\s*:\s*studio->prevMode\);\s*break;",
        "case TIC_MENU_MODE: studio_menu_back(studio->menu); break; /* TIC80_EMBED_ESC_MENU */",
        studio_c,
        count=1,
    )
    studio_c, n_run = re.subn(
        r"case TIC_RUN_MODE:\s*showGameMenu\(studio\)\s*\?\s*gotoMenu\(studio\)\s*:\s*setStudioMode\(studio,\s*studio->prevMode\s*==\s*TIC_RUN_MODE\s*\?\s*TIC_CONSOLE_MODE\s*:\s*studio->prevMode\);\s*break;",
        "case TIC_RUN_MODE: gotoMenu(studio); break; /* TIC80_EMBED_ESC_MENU */",
        studio_c,
        count=1,
    )
    if n_menu == 0 or n_run == 0:
        raise SystemExit("Could not locate Escape RUN/MENU handling in studio.c")

if "TIC80_EMBED_NO_CTRLQ" not in studio_c:
    studio_c, n_ctrlq = re.subn(
        r"[ \t]*if\(keyWasPressedOnce\(studio, tic_key_q\)\) studio_exit\(studio\);",
        "#if defined(TIC80_EMBED_API)\n        if(false) {} /* TIC80_EMBED_NO_CTRLQ */\n#else\n        if(keyWasPressedOnce(studio, tic_key_q)) studio_exit(studio);\n#endif",
        studio_c,
        count=1,
    )
    if n_ctrlq == 0:
        raise SystemExit("Could not locate Ctrl+Q handler in studio.c")

studio_c_path.write_text(studio_c)

# --- mainmenu.c: remove the "QUIT TIC-80" item (WASM build cannot relaunch) ---
mainmenu_c_path = src / "src/studio/screens/mainmenu.c"
mainmenu_c = mainmenu_c_path.read_text()
if "TIC80_EMBED_NO_QUIT" not in mainmenu_c:
    mainmenu_c, n_fn = re.subn(
        r"(static void onExitStudio\(void\* data, s32 pos\)\s*\{\s*StudioMainMenu\* main = data;\s*exitStudio\(main->studio\);\s*\})",
        r"#if !defined(TIC80_EMBED_API)\n\1\n#endif /* TIC80_EMBED_NO_QUIT */",
        mainmenu_c,
        count=1,
    )
    mainmenu_c, n_item = re.subn(
        r'(\{"OPTIONS",\s*showOptionsMenu\},)\s*\{""\},\s*\{"QUIT TIC-80",\s*onExitStudio\},',
        '\\1\n#if !defined(TIC80_EMBED_API)\n    {""},\n    {"QUIT TIC-80", onExitStudio},\n#endif /* TIC80_EMBED_NO_QUIT */',
        mainmenu_c,
        count=1,
    )
    if n_fn == 0 or n_item == 0:
        raise SystemExit("Could not locate QUIT TIC-80 menu item in mainmenu.c")
    mainmenu_c_path.write_text(mainmenu_c)

# --- mainmenu.c: drop the "Press F1 to switch to editor" hint (no embedded editor) ---
mainmenu_c = mainmenu_c_path.read_text()
if "TIC80_EMBED_NO_F1_HINT" not in mainmenu_c:
    mainmenu_c, n_hint = re.subn(
        r'\{"CLOSE GAME",\s*onExitGame,\s*NULL,\s*"Press F1 to switch to editor"\},',
        '#if defined(TIC80_EMBED_API)\n'
        '    {"CLOSE GAME",  onExitGame},\n'
        '#else\n'
        '    {"CLOSE GAME",  onExitGame, NULL, "Press F1 to switch to editor"},\n'
        '#endif /* TIC80_EMBED_NO_F1_HINT */',
        mainmenu_c,
        count=1,
    )
    if n_hint == 0:
        raise SystemExit("Could not locate CLOSE GAME F1 hint in mainmenu.c")
    mainmenu_c_path.write_text(mainmenu_c)

# --- mainmenu.c: label the reset item "RESTART GAME" (clearer for players) ---
mainmenu_c = mainmenu_c_path.read_text()
if "TIC80_EMBED_RESTART_LABEL" not in mainmenu_c:
    mainmenu_c, n_restart = re.subn(
        r'\{"RESET GAME",\s*onResetGame\},',
        '#if defined(TIC80_EMBED_API)\n'
        '    {"RESTART GAME", onResetGame},\n'
        '#else\n'
        '    {"RESET GAME",  onResetGame},\n'
        '#endif /* TIC80_EMBED_RESTART_LABEL */',
        mainmenu_c,
        count=1,
    )
    if n_restart == 0:
        raise SystemExit("Could not locate RESET GAME menu item in mainmenu.c")
    mainmenu_c_path.write_text(mainmenu_c)

# --- mainmenu.c: add an "OPEN STUDIO" item (between CLOSE GAME and SURF) ---
# Mirrors the `studio` console command: switch to a visual editor and let the
# host app bring the TIC-80 panel forward via TIC80_EMBED_STUDIO_REQUESTED.
mainmenu_c = mainmenu_c_path.read_text()
if "TIC80_EMBED_OPEN_STUDIO" not in mainmenu_c:
    mainmenu_c, n_inc = re.subn(
        r'#include "mainmenu\.h"',
        '#include "mainmenu.h"\n\n#if defined(TIC80_EMBED_API)\n#include "system/sdl/embed_api.h"\n#endif',
        mainmenu_c,
        count=1,
    )
    mainmenu_c, n_hdl = re.subn(
        r'(static void onSurf\(void\* data, s32 pos\))',
        '#if defined(TIC80_EMBED_API)\n'
        'static void onOpenStudio(void* data, s32 pos)\n'
        '{\n'
        '    StudioMainMenu* main = data;\n'
        '    setStudioMode(main->studio, TIC_SPRITE_MODE);\n'
        '    tic80_embed_notify(TIC80_EMBED_STUDIO_REQUESTED);\n'
        '}\n'
        '#endif /* TIC80_EMBED_OPEN_STUDIO */\n\n'
        '\\1',
        mainmenu_c,
        count=1,
    )
    mainmenu_c, n_enum = re.subn(
        r'(#if defined\(BUILD_SURF\)\s*\n\s*MainMenu_Surf,)',
        '#if defined(TIC80_EMBED_API)\n    MainMenu_OpenStudio,\n#endif\n\\1',
        mainmenu_c,
        count=1,
    )
    mainmenu_c, n_item = re.subn(
        r'(#if defined\(BUILD_SURF\)\s*\n\s*\{"SURF",\s*onSurf\},)',
        '#if defined(TIC80_EMBED_API)\n    {"OPEN STUDIO", onOpenStudio},\n#endif\n\\1',
        mainmenu_c,
        count=1,
    )
    if n_inc == 0 or n_hdl == 0 or n_enum == 0 or n_item == 0:
        raise SystemExit("Could not add OPEN STUDIO menu item in mainmenu.c")
    mainmenu_c_path.write_text(mainmenu_c)

# --- mainmenu.c: keep RESUME/RESTART visible in the embed pause menu ---
# The cart is injected via tic80_cart_import (console->rom.name stays empty), so
# studio_is_cart_loaded() is false and mainMenuOffset() would skip the top items.
# The pause menu is only reachable while a game runs, so always show them.
mainmenu_c = mainmenu_c_path.read_text()
if "TIC80_EMBED_MENU_OFFSET" not in mainmenu_c:
    mainmenu_c, n_off = re.subn(
        r'static inline s32 mainMenuOffset\(StudioMainMenu\* menu\)\s*\{\s*if \(menu->count > 0\) return 0;\s*if \(!studio_is_cart_loaded\(menu->studio\)\)\s*return 3;\s*return 1;\s*\}',
        'static inline s32 mainMenuOffset(StudioMainMenu* menu)\n'
        '{\n'
        '#if defined(TIC80_EMBED_API)\n'
        '    return menu->count > 0 ? 0 : 1; /* TIC80_EMBED_MENU_OFFSET */\n'
        '#else\n'
        '    if (menu->count > 0) return 0;\n\n'
        '    if (!studio_is_cart_loaded(menu->studio))\n'
        '        return 3;\n\n'
        '    return 1;\n'
        '#endif\n'
        '}',
        mainmenu_c,
        count=1,
    )
    mainmenu_c, n_back = re.subn(
        r'studio_menu_init\(main->menu, MainMenu \+ offset, COUNT_OF\(MainMenu\) - offset, 0, 0, studio_is_cart_loaded\(main->studio\) \? onResumeGame : NULL, main\);',
        '#if defined(TIC80_EMBED_API)\n'
        '    studio_menu_init(main->menu, MainMenu + offset, COUNT_OF(MainMenu) - offset, 0, 0, onResumeGame, main);\n'
        '#else\n'
        '    studio_menu_init(main->menu, MainMenu + offset, COUNT_OF(MainMenu) - offset, 0, 0, studio_is_cart_loaded(main->studio) ? onResumeGame : NULL, main);\n'
        '#endif',
        mainmenu_c,
        count=1,
    )
    if n_off == 0 or n_back == 0:
        raise SystemExit("Could not patch mainMenuOffset in mainmenu.c")
    mainmenu_c_path.write_text(mainmenu_c)

# --- console.c: remove the exit/quit console command ---
console_c = console_c_path.read_text()
if "TIC80_EMBED_NO_EXIT_CMD" not in console_c:
    console_c, n_fn = re.subn(
        r"(static void onExitCommand\(Console\* console\)\s*\{\s*exitStudio\(console->studio\);\s*commandDone\(console\);\s*\})",
        r"#if !defined(TIC80_EMBED_API)\n\1\n#endif /* TIC80_EMBED_NO_EXIT_CMD */",
        console_c,
        count=1,
    )
    # The command lives inside the \-continued COMMANDS_LIST macro, where a C
    # preprocessor #if is illegal, so drop the entry (and its blank continuation)
    # outright.
    console_c, n_cmd = re.subn(
        r'[ \t]*macro\("exit",[ \t]*\\\n[ \t]*"quit",[ \t]*\\\n[ \t]*"Exit the application \(Hotkey: CTRL\+Q\)\.",[ \t]*\\\n[ \t]*NULL,[ \t]*\\\n[ \t]*onExitCommand,[ \t]*\\\n[ \t]*NULL,[ \t]*\\\n[ \t]*NULL\)[ \t]*\\\n[ \t]*\\\n',
        "",
        console_c,
        count=1,
    )
    if n_fn == 0 or n_cmd == 0:
        raise SystemExit("Could not locate exit/quit command in console.c")
    console_c_path.write_text(console_c)

print("TIC-80 Web Editor embed API applied.")
PY
