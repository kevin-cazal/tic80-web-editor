#pragma once

typedef struct Studio Studio;

enum {
    TIC80_EMBED_CART_LOADED = 1,
    TIC80_EMBED_CART_SAVED = 2,
    TIC80_EMBED_CART_UPDATED = 3,
    TIC80_EMBED_EDIT_REQUESTED = 4,
};

void tic80_embed_set_studio(Studio* studio);
void tic80_embed_notify(int reason);

#if defined(__EMSCRIPTEN__)
#include <emscripten.h>

EMSCRIPTEN_KEEPALIVE const char* tic80_cart_export(int* out_len);
EMSCRIPTEN_KEEPALIVE int tic80_cart_import(const char* text, int len, const char* name);
EMSCRIPTEN_KEEPALIVE int tic80_cart_changed(void);
EMSCRIPTEN_KEEPALIVE const char* tic80_get_script_ext(void);
#endif
