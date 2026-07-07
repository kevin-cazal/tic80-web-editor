#include "embed_api.h"

#include "studio/studio.h"
#include "studio/project.h"
#include "script.h"
#include "cart.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(__EMSCRIPTEN__)
#include <emscripten.h>
#endif

static Studio* g_studio = NULL;

void tic80_embed_set_studio(Studio* studio)
{
    g_studio = studio;
}

void tic80_embed_notify(int reason)
{
#if defined(__EMSCRIPTEN__)
    EM_ASM({
        if (Module.onCartChanged) {
            Module.onCartChanged($0);
        }
    }, reason);
#else
    (void)reason;
#endif
}

#if defined(__EMSCRIPTEN__)

static char g_export_buffer[sizeof(tic_cartridge) * 4];

static const char* workspace_name(void)
{
    static char name[32] = "workspace.lua";

    if(!g_studio)
        return name;

    const tic_script* script = tic_get_script(getMemory(g_studio));
    if(script && script->fileExtension)
        snprintf(name, sizeof name, "workspace.%s", script->fileExtension);

    return name;
}

EMSCRIPTEN_KEEPALIVE
const char* tic80_cart_export(int* out_len)
{
    if(!g_studio || !out_len)
        return NULL;

    tic_mem* tic = getMemory(g_studio);
    if(!tic)
        return NULL;

    const char* name = workspace_name();
    s32 size = tic_project_save(name, g_export_buffer, &tic->cart);
    if(size <= 0 && tic->cart.code.data[0] != '\0')
    {
        size = (s32)strlen(tic->cart.code.data);
        if(size > (s32)sizeof(g_export_buffer) - 1)
            size = (s32)sizeof(g_export_buffer) - 1;
        memcpy(g_export_buffer, tic->cart.code.data, size);
    }

    if(size <= 0)
    {
        *out_len = 0;
        return NULL;
    }

    g_export_buffer[size] = '\0';
    *out_len = size;
    return g_export_buffer;
}

EMSCRIPTEN_KEEPALIVE
int tic80_cart_import(const char* text, int len, const char* name)
{
    if(!g_studio || !text || len <= 0)
        return 0;

    tic_mem* tic = getMemory(g_studio);
    if(!tic)
        return 0;

    const char* cart_name = name && name[0] ? name : workspace_name();
    if(!tic_project_load(cart_name, text, len, &tic->cart))
        return 0;

    tic_api_reset(tic);
    studioRomLoaded(g_studio);
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int tic80_cart_changed(void)
{
    if(!g_studio)
        return 0;

    return studioCartChanged(g_studio) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
const char* tic80_get_script_ext(void)
{
    static char ext[16] = "lua";

    if(!g_studio)
        return ext;

    const tic_script* script = tic_get_script(getMemory(g_studio));
    if(script && script->fileExtension)
        snprintf(ext, sizeof ext, "%s", script->fileExtension);

    return ext;
}

#endif
