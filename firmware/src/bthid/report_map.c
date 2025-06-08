/*
 * This file is part of the Blue2Joy project
 * (https://github.com/cepetr/blue2joy).
 * Copyright (c) 2025
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include "report_map.h"

LOG_MODULE_DECLARE(blue2joy, CONFIG_LOG_DEFAULT_LEVEL);

typedef enum {
    ITEM_TYPE_MAIN = 0x00,
    ITEM_TYPE_GLOBAL = 0x01,
    ITEM_TYPE_LOCAL = 0x02,
    ITEM_TYPE_RESERVED = 0x03,
} hrm_item_type_t;

typedef enum {
    ITEM_TAG_MAIN_INPUT = 0x08,
    ITEM_TAG_MAIN_OUTPUT = 0x09,
    ITEM_TAG_MAIN_COLLECTION = 0x0A,
    ITEM_TAG_MAIN_FEATURE = 0x0B,
    ITEM_TAG_MAIN_END_COLLECTION = 0x0C,
} hrm_tag_main_t;

typedef enum {
    ITEM_TAG_GLOBAL_USAGE_PAGE = 0x00,
    ITEM_TAG_GLOBAL_LOGICAL_MIN = 0x01,
    ITEM_TAG_GLOBAL_LOGICAL_MAX = 0x02,
    ITEM_TAG_GLOBAL_PHYSICAL_MIN = 0x03,
    ITEM_TAG_GLOBAL_PHYSICAL_MAX = 0x04,
    ITEM_TAG_GLOBAL_UNIT_EXPONENT = 0x05,
    ITEM_TAG_GLOBAL_UNIT = 0x06,
    ITEM_TAG_GLOBAL_REPORT_SIZE = 0x07,
    ITEM_TAG_GLOBAL_REPORT_ID = 0x08,
    ITEM_TAG_GLOBAL_REPORT_COUNT = 0x09,
    ITEM_TAG_GLOBAL_PUSH = 0x0A,
    ITEM_TAG_GLOBAL_POP = 0x0B,
} hrm_tag_global_t;

typedef enum {
    ITEM_TAG_LOCAL_USAGE = 0x00,
    ITEM_TAG_LOCAL_USAGE_MIN = 0x01,
    ITEM_TAG_LOCAL_USAGE_MAX = 0x02,
    ITEM_TAG_LOCAL_DESIGNATOR_INDEX = 0x03,
    ITEM_TAG_LOCAL_DESIGNATOR_MIN = 0x04,
    ITEM_TAG_LOCAL_DESIGNATOR_MAX = 0x05,
    ITEM_TAG_LOCAL_STRING_INDEX = 0x07,
    ITEM_TAG_LOCAL_STRING_MIN = 0x08,
    ITEM_TAG_LOCAL_STRING_MAX = 0x09,
    ITEM_TAG_LOCAL_DELIMITER = 0x0A,
} hrm_tag_local_t;

#define ITEM_SIZE(x) ((x) & 0x03)
#define ITEM_TYPE(x) (((x) >> 2) & 0x03)
#define ITEM_TAG(x)  (((x) >> 4) & 0x0F)

typedef struct {
    uint8_t tag;
    uint8_t type;
    uint8_t size;
    const uint8_t *data;
} hrm_item_t;

#define ITEM_FLAG_CONSTANT     0x01
#define ITEM_FLAG_VARIABLE     0x02
#define ITEM_FLAG_RELATIVE     0x04
#define ITEM_FLAG_WRAP         0x08
#define ITEM_FLAG_NONLINEAR    0x10
#define ITEM_FLAG_NO_PREFERRED 0x20
#define ITEM_FLAG_NULL_STATE   0x40
#define ITEM_FLAG_NON_VOLATILE 0x80
#define ITEM_FLAG_BUFFERED     0x100

typedef struct {
    uint16_t usage_page;
    uint16_t usage;
    uint8_t report_id;
    uint32_t report_size;
    uint32_t report_count;
    int32_t logical_min;
    int32_t logical_max;
    int32_t physical_min;
    int32_t physical_max;
    int32_t unit_exponent;
    uint32_t unit;
} hrm_globals_t;

typedef struct {
    size_t usages_count;
    uint32_t usages[32];
    uint16_t usage_min;
    uint16_t usage_max;
    uint16_t designator_index;
    uint16_t designator_min;
    uint16_t designator_max;
    uint16_t string_index;
    uint16_t string_min;
    uint16_t string_max;
    uint8_t delimiter;
} hrm_locals_t;

typedef struct {
    hrm_globals_t items[8];
    size_t depth;
} hrm_global_stack_t;

typedef struct {
    uint8_t type;
    uint16_t usage_page;
    uint16_t usage;
} hrm_collection_t;

typedef struct {
    hrm_collection_t items[8];
    size_t depth;
} hrm_collection_stack_t;

static const uint8_t *parse_item(const uint8_t *cur, const uint8_t *end, hrm_item_t *out)
{
    if (cur >= end) {
        return NULL;
    }

    uint8_t b0 = *cur++;
    out->tag = ITEM_TAG(b0);
    out->type = ITEM_TYPE(b0);
    uint8_t size_code = ITEM_SIZE(b0);

    // 0 -> 0 bytes, 1 -> 1, 2 -> 2, 3 -> 4
    out->size = size_code ? (1u << (size_code - 1)) : 0;

    // Long item?
    if (out->tag == 0x0F) {
        if (cur + 2 > end) {
            LOG_ERR("Truncated long item header");
            return NULL;
        }
        out->size = *cur++;
        out->tag = *cur++;
        if (cur + out->size > end) {
            LOG_ERR("Truncated long item payload");
            return NULL;
        }
    } else {
        if (cur + out->size > end) {
            LOG_ERR("Truncated item payload");
            return NULL;
        }
    }

    out->data = cur;
    return cur + out->size;
}

static inline uint32_t get_u32_le(const uint8_t *p, size_t n)
{
    return (n > 0 ? (uint32_t)p[0] : 0) | (n > 1 ? (uint32_t)p[1] << 8 : 0) |
           (n > 2 ? (uint32_t)p[2] << 16 : 0) | (n > 3 ? (uint32_t)p[3] << 24 : 0);
}

static uint32_t hrm_item_u32(const hrm_item_t *item)
{
    return get_u32_le(item->data, item->size);
}

static int32_t hrm_item_i32(const hrm_item_t *item)
{
    int32_t value = (int32_t)get_u32_le(item->data, item->size);

    // Manual sign-extension for 1–3-byte integers
    if (item->size < 4 && (item->data[item->size - 1] & 0x80)) {
        value |= ~((1 << (8 * item->size)) - 1);
    }

    return value;
}

static bool process_global_item(const hrm_item_t *item, hrm_globals_t *globals,
                                hrm_global_stack_t *gstack)
{
    switch (item->tag) {
    case ITEM_TAG_GLOBAL_USAGE_PAGE:
        globals->usage_page = hrm_item_u32(item);
        break;
    case ITEM_TAG_GLOBAL_LOGICAL_MIN:
        globals->logical_min = hrm_item_i32(item);
        break;
    case ITEM_TAG_GLOBAL_LOGICAL_MAX:
        globals->logical_max = hrm_item_i32(item);
        break;
    case ITEM_TAG_GLOBAL_PHYSICAL_MIN:
        globals->physical_min = hrm_item_i32(item);
        break;
    case ITEM_TAG_GLOBAL_PHYSICAL_MAX:
        globals->physical_max = hrm_item_i32(item);
        break;
    case ITEM_TAG_GLOBAL_UNIT_EXPONENT:
        globals->unit_exponent = hrm_item_i32(item);
        break;
    case ITEM_TAG_GLOBAL_UNIT:
        globals->unit = hrm_item_u32(item);
        break;
    case ITEM_TAG_GLOBAL_REPORT_SIZE:
        globals->report_size = hrm_item_u32(item);
        break;
    case ITEM_TAG_GLOBAL_REPORT_ID:
        globals->report_id = hrm_item_u32(item);
        break;
    case ITEM_TAG_GLOBAL_REPORT_COUNT:
        globals->report_count = hrm_item_u32(item);
        break;
    case ITEM_TAG_GLOBAL_PUSH:
        if (gstack->depth < ARRAY_SIZE(gstack->items)) {
            gstack->items[gstack->depth++] = *globals;
        } else {
            // Stack overflow, handle error
            LOG_ERR("Global stack overflow");
            return false;
        }
        break;
    case ITEM_TAG_GLOBAL_POP:
        if (gstack->depth > 0) {
            *globals = gstack->items[--gstack->depth];
        } else {
            // Stack underflow, handle error
            LOG_ERR("Global stack underflow");
            return false;
        }
        // Handle push/pop if needed
        break;
    default:
        // Unknown/reserved global item
        LOG_WRN("Unknown global item tag: %d", item->tag);
        break;
    }

    return true;
}

static bool process_local_item(const hrm_item_t *item, hrm_locals_t *locals)
{
    switch (item->tag) {
    case ITEM_TAG_LOCAL_USAGE:
        if (locals->usages_count < ARRAY_SIZE(locals->usages)) {
            // Store usage index
            locals->usages[locals->usages_count++] = hrm_item_u32(item);
        } else {
            // Usage array overflow, handle error
            LOG_ERR("Local usages array overflow");
            return false;
        }
        break;
    case ITEM_TAG_LOCAL_USAGE_MIN:
        locals->usage_min = hrm_item_u32(item);
        break;
    case ITEM_TAG_LOCAL_USAGE_MAX:
        locals->usage_max = hrm_item_u32(item);
        break;
    case ITEM_TAG_LOCAL_DESIGNATOR_INDEX:
        locals->designator_index = hrm_item_u32(item);
        break;
    case ITEM_TAG_LOCAL_DESIGNATOR_MIN:
        locals->designator_min = hrm_item_u32(item);
        break;
    case ITEM_TAG_LOCAL_DESIGNATOR_MAX:
        locals->designator_max = hrm_item_u32(item);
        break;
    case ITEM_TAG_LOCAL_STRING_INDEX:
        locals->string_index = hrm_item_u32(item);
        break;
    case ITEM_TAG_LOCAL_STRING_MIN:
        locals->string_min = hrm_item_u32(item);
        break;
    case ITEM_TAG_LOCAL_STRING_MAX:
        locals->string_max = hrm_item_u32(item);
        break;
    case ITEM_TAG_LOCAL_DELIMITER:
        locals->delimiter = item->data[0];
        break;
    default:
        // Unknown/reserved local item
        LOG_WRN("Unknown local item tag: %d", item->tag);
        break;
    }
    return true;
}

static hrm_report_t *hrm_create_report(hrm_t *hrm, uint8_t report_id)
{
    if (hrm->report_count < ARRAY_SIZE(hrm->reports)) {
        hrm_report_t *report = &hrm->reports[hrm->report_count++];
        report->id = report_id;
        report->bit_size = 0;
        report->field_count = 0;
        return report;
    } else {
        return NULL;
    }
}

static bool process_input_item(const hrm_item_t *item, hrm_globals_t *globals, hrm_locals_t *locals,
                               hrm_collection_stack_t *cstack, hrm_t *hrm)
{

    uint32_t item_flags = hrm_item_u32(item);

    if (globals->usage_page >= 0xFF00) {
        // Ignore vendor-defined usage pages
        return true;
    }

    // Find report by ID in hrm or create a new one
    hrm_report_t *report = (hrm_report_t *)hrm_find_report(hrm, globals->report_id);
    if (report == NULL) {
        report = hrm_create_report(hrm, globals->report_id);
        if (report == NULL) {
            LOG_ERR("Failed to create report with ID %d", globals->report_id);
            return false;
        }
    }

    if (item_flags & ITEM_FLAG_CONSTANT) {
        // Constant item, no fields to add
        report->bit_size += globals->report_size * globals->report_count;
        return true;
    }

    bool have_range = (locals->usage_min != 0 || locals->usage_max != 0);

    for (uint32_t i = 0; i < globals->report_count; i++) {
        uint16_t usage = 0;

        if (i < locals->usages_count) {
            usage = locals->usages[i];
        } else if (have_range && i < (locals->usage_max - locals->usage_min + 1)) {
            usage = locals->usage_min + i;
        }

        if (report->field_count < ARRAY_SIZE(report->fields)) {
            hrm_field_t *field = &report->fields[report->field_count++];
            field->bit_offset = report->bit_size;
            field->bit_size = globals->report_size;
            field->usage = (globals->usage_page << 16) | usage;
            field->logical_min = globals->logical_min;
            field->logical_max = globals->logical_max;
        } else {
            // Too many fields in the report
            LOG_ERR("Field array overflow in report with ID %d", globals->report_id);
            return false;
        }

        report->bit_size += globals->report_size;
    }

    return true;
}

static bool process_main_item(const hrm_item_t *item, hrm_globals_t *globals, hrm_locals_t *locals,
                              hrm_collection_stack_t *cstack, hrm_t *hrm)
{
    switch (item->tag) {
    case ITEM_TAG_MAIN_INPUT:
        // Process input item
        process_input_item(item, globals, locals, cstack, hrm);
        break;
    case ITEM_TAG_MAIN_OUTPUT:
        // Process output item
        break;
    case ITEM_TAG_MAIN_FEATURE:
        // Process feature item
        break;
    case ITEM_TAG_MAIN_COLLECTION:
        // Start a new collection
        if (cstack->depth < ARRAY_SIZE(cstack->items)) {
            hrm_collection_t *coll = &cstack->items[cstack->depth++];
            coll->type = item->type;
            coll->usage_page = globals->usage_page;
            coll->usage = locals->usages[0];
        } else {
            // Stack overflow
            LOG_ERR("Collection stack overflow");
            return false;
        }

        break;
    case ITEM_TAG_MAIN_END_COLLECTION:
        // End the current collection
        if (cstack->depth > 0) {
            cstack->depth--;
        } else {
            // Stack underflow
            LOG_ERR("Collection stack underflow");
            return false;
        }
        break;
    default:
        // Unknown/reserved main item
        LOG_WRN("Unknown main item tag: %d", item->tag);
        break;
    }
    return true;
}

void hrm_parse(hrm_t *hrm, const uint8_t *data, size_t size)
{
    hrm_globals_t globals = {0};
    hrm_locals_t locals = {0};
    hrm_global_stack_t gstack = {0};
    hrm_collection_stack_t cstack = {0};

    const uint8_t *p = data;
    const uint8_t *end = data + size;

    memset(hrm, 0, sizeof(*hrm));

    hrm_item_t item;
    while (p < end && (p = parse_item(p, end, &item)) != NULL) {
        bool ok = true;

        switch (item.type) {
        case ITEM_TYPE_GLOBAL:
            ok = process_global_item(&item, &globals, &gstack);
            break;

        case ITEM_TYPE_LOCAL:
            ok = process_local_item(&item, &locals);
            break;

        case ITEM_TYPE_MAIN:
            ok = process_main_item(&item, &globals, &locals, &cstack, hrm);
            memset(&locals, 0, sizeof locals);
            break;

        default:
            LOG_WRN("Unknown type %u @%td", item.type, p - data);
        }

        if (!ok) {
            break;
        }
    }

    if (p == NULL) {
        LOG_ERR("Parsing error");
    } else {
        LOG_INF("Parsing completed successfully.");
    }
}

const hrm_report_t *hrm_find_report(const hrm_t *hrm, uint8_t report_id)
{
    for (size_t i = 0; i < hrm->report_count; ++i) {
        if (hrm->reports[i].id == report_id) {
            return &hrm->reports[i];
        }
    }
    return NULL;
}

const hrm_field_t *hrm_report_find_field(const hrm_report_t *report, hrm_usage_t usage)
{
    for (size_t i = 0; i < report->field_count; ++i) {
        if (report->fields[i].usage == usage) {
            return &report->fields[i];
        }
    }
    return NULL;
}

int32_t hrm_field_extract(const hrm_field_t *field, const uint8_t *data)
{
    uint32_t acc = 0;
    size_t dst_pos = 0;
    size_t src_pos = field->bit_offset;
    size_t bits_left = field->bit_size;

    while (bits_left) {
        size_t byte_idx = src_pos >> 3;
        size_t bit_idx = src_pos & 7;
        size_t chunk_bits = MIN(8 - bit_idx, bits_left);

        uint32_t chunk = (data[byte_idx] >> bit_idx) & ((1 << chunk_bits) - 1);

        acc |= chunk << dst_pos;

        src_pos += chunk_bits;
        dst_pos += chunk_bits;
        bits_left -= chunk_bits;
    }

    if (field->logical_min < 0) {
        // Sign-extend the value
        size_t sign_bit = field->bit_size - 1;
        if (acc & (1 << sign_bit)) {
            acc |= ~((1 << field->bit_size) - 1);
        }
    }

    return acc;
}
