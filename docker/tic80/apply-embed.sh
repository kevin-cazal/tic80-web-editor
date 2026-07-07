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

print("TIC-80 Web Editor embed API applied.")
PY
