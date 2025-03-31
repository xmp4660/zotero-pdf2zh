import { getLocaleID, getString } from "../utils/locale";
import { getPref } from "../utils/prefs";
import axios from "axios";

export enum PDFType {
    MONO = "mono",
    DUAL = "dual",
    MONO_CUT = "mono-cut",
    DUAL_CUT = "dual-cut",
    COMPARE = "compare",
}
export interface ServerConfig {
    // 传输到客户端脚本
    serverUrl: string;
    threadNum: string;
    engine: string;
    service: string;
    outputPath: string;
    configPath: string;
    mono: string;
    dual: string;
    mono_cut: string;
    dual_cut: string;
    compare: string;
    babeldoc: string;
    sourceLang: string;
    targetLang: string;
}

export interface PDFOperationOptions {
    rename: boolean;
    openAfterProcess: boolean;
}

export type TranslationResponse = {
    status: string;
    translatedPath1: string;
    translatedPath2: string;
    message: string;
};

function example(
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
) {
    const original = descriptor.value;
    descriptor.value = function (...args: any) {
        try {
            ztoolkit.log(
                `Calling example ${target.name}.${String(propertyKey)}`,
            );
            return original.apply(this, args);
        } catch (e) {
            ztoolkit.log(
                `Error in example ${target.name}.${String(propertyKey)}`,
                e,
            );
            throw e;
        }
    };
    return descriptor;
}

export class BasicExampleFactory {
    @example
    static registerNotifier() {
        const callback = {
            notify: async (
                event: string,
                type: string,
                ids: number[] | string[],
                extraData: { [key: string]: any },
            ) => {
                if (!addon?.data.alive) {
                    this.unregisterNotifier(notifierID);
                    return;
                }
                addon.hooks.onNotify(event, type, ids, extraData);
            },
        };
        const notifierID = Zotero.Notifier.registerObserver(callback, [
            "tab",
            "item",
            "file",
        ]);

        Zotero.Plugins.addObserver({
            shutdown: ({ id }) => {
                if (id === addon.data.config.addonID)
                    this.unregisterNotifier(notifierID);
            },
        });
    }

    @example
    static exampleNotifierCallback() {
        new ztoolkit.ProgressWindow(addon.data.config.addonName)
            .createLine({
                text: "Open Tab Detected!",
                type: "success",
                progress: 100,
            })
            .show();
    }

    @example
    private static unregisterNotifier(notifierID: string) {
        Zotero.Notifier.unregisterObserver(notifierID);
    }

    @example
    static registerPrefs() {
        Zotero.PreferencePanes.register({
            pluginID: addon.data.config.addonID,
            src: rootURI + "content/preferences.xhtml",
            label: getString("prefs-title"),
            image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.svg`,
        });
    }
}

export class UIExampleFactory {
    @example
    static registerRightClickMenuItem() {
        const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.svg`;
        const MENU_ITEMS = [
            {
                id: "translate-pdf",
                label: getString("prefs-menu-translate"),
                command: "translatePDF",
            },
            {
                id: "cut-pdf",
                label: getString("prefs-menu-cut"),
                command: "cutPDF",
            },
            {
                id: "compare-pdf",
                label: getString("prefs-menu-compare"),
                command: "comparePDF",
            },
        ];
        MENU_ITEMS.forEach(({ id, label, command }) => {
            ztoolkit.Menu.register("item", {
                tag: "menuitem",
                id: `zotero-itemmenu-${id}`,
                label: `PDF2zh: ${label}`,
                commandListener: () => addon.hooks.onDialogEvents(command),
                icon: menuIcon,
            });
        });
    }
}

export class HelperExampleFactory {
    static async processWorker(endpoint: string) {
        const worker = async (
            item: Zotero.Item,
            fileData: { fileName: string; base64: string },
            config: ServerConfig,
        ) => {
            const response = await this.sendRequest(fileData, config, endpoint);
            this.hendleResponse(
                response,
                item,
                fileData.fileName,
                config,
                endpoint,
            );
        };

        const pane = ztoolkit.getGlobal("ZoteroPane");
        const selectedItems = pane.getSelectedItems();
        if (selectedItems.length == 0) {
            ztoolkit.getGlobal("alert")("请先选择一个条目或附件。");
            return;
        }
        for (const item of selectedItems) {
            await this.handlePDFProcessing(item, worker);
        }
    }

    static async sendRequest(
        fileData: { fileName: string; base64: string },
        config: ServerConfig,
        endpoint: string,
    ) {
        const response = await fetch(`${config.serverUrl}/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fileName: fileData.fileName,
                fileContent: fileData.base64,
                ...config,
            }),
        });

        if (!response.ok) throw new Error(`服务器错误: ${response.status}`);
        return JSON.parse(await response.text());
    }

    static async hendleResponse(
        response: any,
        item: Zotero.Item,
        fileName: string,
        config: ServerConfig,
        endpoint: string,
    ) {
        if (response.status !== "success") throw new Error(response.message);
        ztoolkit.log(endpoint, "response", response);
        if (endpoint == "translate") {
            ztoolkit.log("Processing translation PDF");
            const operations = [
                { type: PDFType.MONO, enabled: getPref("mono") },
                { type: PDFType.DUAL, enabled: getPref("dual") },
                { type: PDFType.MONO_CUT, enabled: getPref("mono-cut") },
                { type: PDFType.DUAL_CUT, enabled: getPref("dual-cut") },
                { type: PDFType.COMPARE, enabled: getPref("compare") },
            ];
            for (const { type, enabled } of operations) {
                ztoolkit.log(type, enabled);
                if (type == PDFType.COMPARE && config.babeldoc == "true") {
                    ztoolkit.log("Babeldoc enabled, skipping compare PDF");
                    continue;
                }
                if (enabled == true || enabled == "true") {
                    ztoolkit.log(`Processing ${type} PDF`);
                    const variantFileName = fileName.replace(
                        ".pdf",
                        `-${type}.pdf`,
                    );
                    const options = this.getPDFOptions(type);
                    await this.fetchAndAttachPDF({
                        fileName: variantFileName,
                        config: config,
                        item: item,
                        options: options,
                        type: type,
                    });
                }
            }
        } else if (endpoint == "cut") {
            const type =
                fileName.indexOf("-mono") != -1
                    ? PDFType.MONO_CUT
                    : fileName.indexOf("-dual") != -1
                      ? PDFType.DUAL_CUT
                      : "origin-cut";
            const options = this.getPDFOptions(type);
            const variantFileName = fileName.replace(".pdf", `-cut.pdf`);
            await this.fetchAndAttachPDF({
                fileName: variantFileName,
                config: config,
                item: item,
                options: options,
                type: type,
            });
        } else if (endpoint == "compare") {
            const options = this.getPDFOptions(PDFType.COMPARE);
            let variantFileName;
            if (fileName.indexOf("-dual") != -1) {
                variantFileName = fileName.replace("-dual.pdf", `-compare.pdf`);
            } else {
                variantFileName = fileName.replace(".pdf", `-compare.pdf`);
            }
            await this.fetchAndAttachPDF({
                fileName: variantFileName,
                config: config,
                item: item,
                options: options,
                type: PDFType.COMPARE,
            });
        }
    }

    static async blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    static async safeExists(path: string) {
        // 安全的 exists 检查函数
        try {
            return await IOUtils.exists(path);
        } catch (error) {
            ztoolkit.log(`检查路径 ${path} 时出错:`, error);
            return false;
        }
    }

    static async getAttachmentItem(
        item: Zotero.Item,
    ): Promise<Zotero.Item | false> {
        let attachItem;
        if (item.isAttachment()) {
            attachItem = item;
        } else if (item.isRegularItem()) {
            const bestItem = await item.getBestAttachment();
            attachItem = bestItem;
        }
        if (!attachItem) return false;
        return attachItem;
    }

    static async validatePDFAttachment(item: Zotero.Item): Promise<string> {
        const attachItem = await this.getAttachmentItem(item);
        if (!attachItem) return "No valid attachment found";
        const filepath = attachItem.getFilePath().toString();
        if (!filepath?.endsWith(".pdf"))
            throw new Error("Please select a PDF attachment");
        const exists = await this.safeExists(filepath);
        if (!exists) throw new Error("PDF file not found");
        return filepath;
    }

    static async readPDFAsBase64(filepath: string): Promise<string> {
        const contentRaw = await IOUtils.read(filepath);
        const blob = new Blob([contentRaw], { type: "application/pdf" });
        return this.blobToBase64(blob);
    }

    static getServerConfig(): ServerConfig {
        return {
            serverUrl: this.cleanServerUrl(getPref("serverip")?.toString()),
            threadNum: getPref("threadNum")?.toString() || "",
            engine: getPref("engine")?.toString() || "",
            service: getPref("service")?.toString() || "",
            outputPath: getPref("outputPath")?.toString() || "",
            configPath: getPref("configPath")?.toString() || "",
            mono: getPref("mono")?.toString() || "",
            dual: getPref("dual")?.toString() || "",
            mono_cut: getPref("mono-cut")?.toString() || "",
            dual_cut: getPref("dual-cut")?.toString() || "",
            compare: getPref("compare")?.toString() || "",
            babeldoc: getPref("babeldoc")?.toString() || "",
            sourceLang: getPref("sourceLang")?.toString() || "",
            targetLang: getPref("targetLang")?.toString() || "",
        };
    }

    static cleanServerUrl(url?: string): string {
        if (!url) throw new Error("请配置服务器地址");
        return url.replace(/\/translate$/, "").replace(/\/$/, "");
    }

    static getPDFOptions(type: string): PDFOperationOptions {
        return {
            rename: getPref("rename") == true || getPref(`rename`) == "true",
            openAfterProcess:
                getPref(`${type}-open`) == true ||
                getPref(`${type}-open`) == "true",
        };
    }

    static async handlePDFProcessing(
        item: Zotero.Item,
        operation: (
            item: Zotero.Item,
            fileData: { fileName: string; base64: string },
            config: ServerConfig,
        ) => Promise<void>,
    ) {
        try {
            const filepath = await this.validatePDFAttachment(item);
            const fileName = PathUtils.filename(filepath);
            const base64 = await this.readPDFAsBase64(filepath);
            const config = this.getServerConfig();
            await operation(item, { fileName, base64 }, config);
        } catch (error) {
            this.handleError(error);
        }
    }

    static async handleError(error: unknown) {
        const message = error instanceof Error ? error.message : "未知错误";
        ztoolkit.getGlobal("alert")(`PDF处理错误: ${message}`);
        ztoolkit.log(`Error: ${message}`, error);
    }

    static getParentItemID(item: Zotero.Item): number | undefined {
        let ID;
        if (item.isAttachment()) {
            const parentItemID = item.parentItemID;
            ID =
                parentItemID != null && parentItemID !== false
                    ? parentItemID
                    : undefined;
        } else {
            ID = item.id;
        }
        return ID;
    }

    static async addAttachment(params: {
        item: Zotero.Item;
        filePath: string;
        options: PDFOperationOptions;
        type: string;
    }) {
        const { item, filePath, options, type } = params;
        let attachment;
        if (item.isAttachment()) {
            attachment = await Zotero.Attachments.importFromFile({
                file: filePath,
                parentItemID: this.getParentItemID(item),
                libraryID: item.libraryID,
                collections: this.getCollections(item),
                title:
                    options.rename && this.getParentItemID(item)
                        ? type
                        : PathUtils.filename(filePath),
            });
        } else {
            attachment = await Zotero.Attachments.importFromFile({
                file: filePath,
                parentItemID: item.id,
                libraryID: item.libraryID,
                title: options.rename ? type : PathUtils.filename(filePath),
            });
        }
        if (options.openAfterProcess && attachment?.id) {
            Zotero.Reader.open(attachment.id);
        }
    }

    static getCollections(item: Zotero.Item): number[] | undefined {
        const collections = item.getCollections();
        return collections.length > 0 ? [collections[0]] : undefined;
    }

    static async fetchAndAttachPDF(params: {
        fileName: string;
        config: ServerConfig;
        item: Zotero.Item;
        options: PDFOperationOptions;
        type: string;
    }) {
        const { fileName, config, item, options, type } = params;
        const response = await axios.get(
            `${config.serverUrl}/translatedFile/${fileName}`,
            {
                responseType: "arraybuffer",
            },
        );

        const tempPath = PathUtils.join(PathUtils.tempDir, fileName);
        await IOUtils.write(tempPath, new Uint8Array(response.data)); // 从服务器读取文件, 写入文件夹

        await this.addAttachment({
            item,
            filePath: tempPath,
            options: options,
            type: type,
        });
        await IOUtils.remove(tempPath);
    }
}
