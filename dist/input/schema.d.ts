export declare const crashReportSchema: {
    type: "object";
    properties: {
        report_id: {
            type: "string";
            minLength: number;
        };
        crash_report_hash: {
            type: "string";
            minLength: number;
        };
        ts: {
            type: "number";
        };
        name: {
            type: "string";
            minLength: number;
        };
        version: {
            type: "string";
            minLength: number;
        };
        app_build: {
            type: "string";
            nullable: boolean;
        };
        platform: {
            type: "string";
            nullable: boolean;
        };
        platformid: {
            type: "integer";
            nullable: boolean;
        };
        sdk_ver: {
            type: "string";
            nullable: boolean;
        };
        scripting_backend: {
            type: "string";
            nullable: boolean;
        };
        build_guid: {
            type: "string";
            nullable: boolean;
        };
        build_tags: {
            type: "array";
            items: {
                type: "string";
            };
            nullable: boolean;
        };
        project_name: {
            type: "string";
            nullable: boolean;
        };
        appid: {
            type: "string";
            nullable: boolean;
        };
        localprojectid: {
            type: "string";
            nullable: boolean;
        };
        install_mode: {
            type: "string";
            nullable: boolean;
        };
        install_store: {
            type: "string";
            nullable: boolean;
        };
        client_report_id: {
            type: "string";
            nullable: boolean;
        };
        client_ts: {
            type: "number";
            nullable: boolean;
        };
        user_agent: {
            type: "string";
            nullable: boolean;
        };
        sessionid: {
            type: "number";
            nullable: boolean;
        };
        installation_id: {
            type: "string";
            nullable: boolean;
        };
        device_model: {
            type: "string";
            nullable: boolean;
        };
        device_ram: {
            type: "number";
            nullable: boolean;
        };
        device_type: {
            type: "integer";
            nullable: boolean;
        };
        device_vram: {
            type: "integer";
            nullable: boolean;
        };
        device_info_flags: {
            type: "number";
            nullable: boolean;
        };
        debug_device: {
            type: "boolean";
            nullable: boolean;
        };
        rooted_or_jailbroken: {
            type: "boolean";
            nullable: boolean;
        };
        os: {
            type: "string";
            nullable: boolean;
        };
        os_family: {
            type: "integer";
            nullable: boolean;
        };
        system_language: {
            type: "string";
            nullable: boolean;
        };
        cpu: {
            type: "string";
            nullable: boolean;
        };
        cpu_count: {
            type: "integer";
            nullable: boolean;
        };
        cpu_freq: {
            type: "integer";
            nullable: boolean;
        };
        gfx: {
            type: "string";
            nullable: boolean;
        };
        gpu_version: {
            type: "string";
            nullable: boolean;
        };
        gpu_vendor: {
            type: "string";
            nullable: boolean;
        };
        gpu_vendor_id: {
            type: "integer";
            nullable: boolean;
        };
        gpu_device_id: {
            type: "integer";
            nullable: boolean;
        };
        gpu_driver: {
            type: "string";
            nullable: boolean;
        };
        gpu_api: {
            type: "integer";
            nullable: boolean;
        };
        gpu_caps: {
            type: "number";
            nullable: boolean;
        };
        gpu_shader_caps: {
            type: "integer";
            nullable: boolean;
        };
        gpu_copy_texture_support: {
            type: "integer";
            nullable: boolean;
        };
        gpu_render_texture_support: {
            type: "integer";
            nullable: boolean;
        };
        gpu_texture_format_support: {
            type: "integer";
            nullable: boolean;
        };
        gpu_supported_render_target_count: {
            type: "integer";
            nullable: boolean;
        };
        gpu_max_cubemap_size: {
            type: "integer";
            nullable: boolean;
        };
        gpu_max_texture_size: {
            type: "integer";
            nullable: boolean;
        };
        screen_size: {
            type: "string";
            nullable: boolean;
        };
        screen_dpi: {
            type: "number";
            nullable: boolean;
        };
        screen_orientation: {
            type: "integer";
            nullable: boolean;
        };
        refresh_rate: {
            type: "number";
            nullable: boolean;
        };
        is_fullscreen: {
            type: "boolean";
            nullable: boolean;
        };
        sensor_flags: {
            type: "integer";
            nullable: boolean;
        };
        enabled_vr_devices: {
            type: "array";
            items: {
                type: "string";
            };
            nullable: boolean;
        };
        vr_device_name: {
            type: "string";
            nullable: boolean;
        };
        vr_device_model: {
            type: "string";
            nullable: boolean;
        };
        is_wsar_remote: {
            type: "boolean";
            nullable: boolean;
        };
        is_ar_app: {
            type: "boolean";
            nullable: boolean;
        };
        is_editor: {
            type: "boolean";
            nullable: boolean;
        };
        logs_supported: {
            type: "boolean";
            nullable: boolean;
        };
        native_crash: {
            nullable: boolean;
            type: "object";
            properties: {
                signal_name: {
                    type: "string";
                    nullable: boolean;
                };
                signal_code: {
                    type: "string";
                    nullable: boolean;
                };
                signal_address: {
                    type: readonly ["string", "number"];
                    nullable: boolean;
                };
                signal_pc: {
                    type: readonly ["string", "number"];
                    nullable: boolean;
                };
                symbolicated: {
                    type: "boolean";
                    nullable: boolean;
                };
                threads: {
                    type: "array";
                    items: {
                        type: "object";
                        properties: {
                            number: {
                                type: "integer";
                            };
                            name: {
                                type: "string";
                                nullable: boolean;
                            };
                            crashed: {
                                type: "boolean";
                            };
                            frames: {
                                type: "array";
                                items: {
                                    type: "object";
                                    properties: {
                                        image_uuid: {
                                            type: "string";
                                            nullable: boolean;
                                        };
                                        image_name: {
                                            type: "string";
                                            nullable: boolean;
                                        };
                                        image_base_address: {
                                            type: "number";
                                            nullable: boolean;
                                        };
                                        pdb_name: {
                                            type: "string";
                                            nullable: boolean;
                                        };
                                        function_name: {
                                            type: "string";
                                            nullable: boolean;
                                        };
                                        file_name: {
                                            type: "string";
                                            nullable: boolean;
                                        };
                                        line_number: {
                                            type: "integer";
                                            nullable: boolean;
                                        };
                                        absolute_pc: {
                                            type: "number";
                                            nullable: boolean;
                                        };
                                        relative_pc: {
                                            type: "number";
                                            nullable: boolean;
                                        };
                                        symbolication_successful: {
                                            type: "boolean";
                                            nullable: boolean;
                                        };
                                        managed: {
                                            type: "boolean";
                                            nullable: boolean;
                                        };
                                        managed_frame_desc: {
                                            type: "string";
                                            nullable: boolean;
                                        };
                                        is_user_image: {
                                            type: "boolean";
                                            nullable: boolean;
                                        };
                                        is_inlined: {
                                            type: "boolean";
                                            nullable: boolean;
                                        };
                                    };
                                    additionalProperties: boolean;
                                };
                            };
                        };
                        required: readonly ["number", "crashed", "frames"];
                        additionalProperties: boolean;
                    };
                };
            };
            required: readonly ["threads"];
            additionalProperties: boolean;
        };
        managed_exception: {
            nullable: boolean;
            type: "object";
            properties: {
                type: {
                    type: "string";
                    minLength: number;
                };
                message: {
                    type: "string";
                    minLength: number;
                };
                stack_trace: {
                    type: "string";
                    minLength: number;
                };
                native_thread_info: {
                    nullable: boolean;
                    type: "object";
                    properties: {
                        number: {
                            type: "integer";
                        };
                        name: {
                            type: "string";
                            nullable: boolean;
                        };
                        crashed: {
                            type: "boolean";
                        };
                        frames: {
                            type: "array";
                            items: {
                                type: "object";
                                properties: {
                                    image_uuid: {
                                        type: "string";
                                        nullable: boolean;
                                    };
                                    image_name: {
                                        type: "string";
                                        nullable: boolean;
                                    };
                                    image_base_address: {
                                        type: "number";
                                        nullable: boolean;
                                    };
                                    pdb_name: {
                                        type: "string";
                                        nullable: boolean;
                                    };
                                    function_name: {
                                        type: "string";
                                        nullable: boolean;
                                    };
                                    file_name: {
                                        type: "string";
                                        nullable: boolean;
                                    };
                                    line_number: {
                                        type: "integer";
                                        nullable: boolean;
                                    };
                                    absolute_pc: {
                                        type: "number";
                                        nullable: boolean;
                                    };
                                    relative_pc: {
                                        type: "number";
                                        nullable: boolean;
                                    };
                                    symbolication_successful: {
                                        type: "boolean";
                                        nullable: boolean;
                                    };
                                    managed: {
                                        type: "boolean";
                                        nullable: boolean;
                                    };
                                    managed_frame_desc: {
                                        type: "string";
                                        nullable: boolean;
                                    };
                                    is_user_image: {
                                        type: "boolean";
                                        nullable: boolean;
                                    };
                                    is_inlined: {
                                        type: "boolean";
                                        nullable: boolean;
                                    };
                                };
                                additionalProperties: boolean;
                            };
                        };
                    };
                    required: readonly ["number", "crashed", "frames"];
                    additionalProperties: boolean;
                };
            };
            required: readonly ["type", "message", "stack_trace"];
            additionalProperties: boolean;
        };
        log_messages: {
            type: "array";
            items: {
                type: "object";
                properties: {
                    message: {
                        type: "string";
                    };
                    ts: {
                        type: "number";
                        nullable: boolean;
                    };
                    frame: {
                        type: "integer";
                        nullable: boolean;
                    };
                    type: {
                        type: "integer";
                        nullable: boolean;
                    };
                };
                required: readonly ["message"];
                additionalProperties: boolean;
            };
            nullable: boolean;
        };
        user_metadata: {
            type: "array";
            items: {
                type: "object";
                properties: {
                    key: {
                        type: "string";
                        minLength: number;
                    };
                    value: {
                        type: "string";
                    };
                };
                required: readonly ["key", "value"];
                additionalProperties: boolean;
            };
            nullable: boolean;
        };
        counter: {
            type: "integer";
            nullable: boolean;
        };
    };
    required: readonly ["report_id", "crash_report_hash", "ts", "name", "version"];
    additionalProperties: boolean;
};
