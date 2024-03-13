import { FileMeta } from "../../plug-api/types.ts";
import { EventHook } from "../hooks/event.ts";

import type { SpacePrimitives } from "./space_primitives.ts";

/**
 * Events exposed:
 * - file:changed (string, localUpdate: boolean)
 * - file:deleted (string)
 * - file:listed (FileMeta[])
 * - page:saved (string, FileMeta)
 * - page:deleted (string)
 */
export class EventedSpacePrimitives implements SpacePrimitives {
  // Various operations may be going on at the same time, and we don't want to trigger events unnessarily.
  // Therefore we use this variable to track if any operation is in flight, and if so, we skip event triggering.
  // This is ok, because any event will be picked up in a following iteration.
  alreadyFetching = false;

  initialFileListLoad = true;

  spaceSnapshot: Record<string, number> = {};
  constructor(
    private wrapped: SpacePrimitives,
    private eventHook: EventHook,
  ) {
  }

  dispatchEvent(name: string, ...args: any[]): Promise<any[]> {
    return this.eventHook.dispatchEvent(name, ...args);
  }

  async fetchFileList(): Promise<FileMeta[]> {
    if (this.alreadyFetching) {
      // Some other operation (read, write, list, meta) is already going on
      // this will likely trigger events, so let's not worry about any of that and avoid race condition and inconsistent data.
      console.info(
        "alreadyFetching is on, skipping even triggering for fetchFileList.",
      );
      return this.wrapped.fetchFileList();
    }
    // Fetching mutex
    this.alreadyFetching = true;
    // Fetch the list
    const newFileList = await this.wrapped.fetchFileList();
    try {
      const deletedFiles = new Set<string>(Object.keys(this.spaceSnapshot));
      for (const meta of newFileList) {
        const oldHash = this.spaceSnapshot[meta.name];
        const newHash = meta.lastModified;
        // Update in snapshot
        this.spaceSnapshot[meta.name] = newHash;

        // Check what happened to the file
        if (
          (
            // New file scenario
            !oldHash && !this.initialFileListLoad
          ) || (
            // Changed file scenario
            oldHash &&
            oldHash !== newHash
          )
        ) {
          await this.dispatchEvent(
            "file:changed",
            meta.name,
            false,
            oldHash,
            newHash,
          );
        }
        // Page found, not deleted
        deletedFiles.delete(meta.name);
      }

      for (const deletedFile of deletedFiles) {
        delete this.spaceSnapshot[deletedFile];
        await this.dispatchEvent("file:deleted", deletedFile);

        if (deletedFile.endsWith(".md")) {
          const pageName = deletedFile.substring(0, deletedFile.length - 3);
          await this.dispatchEvent("page:deleted", pageName);
        }
      }

      await this.dispatchEvent("file:listed", newFileList);
      this.initialFileListLoad = false;
      return newFileList;
    } finally {
      this.alreadyFetching = false;
    }
  }

  async readFile(
    name: string,
  ): Promise<{ data: Uint8Array; meta: FileMeta }> {
    try {
      // Fetching mutex
      const wasFetching = this.alreadyFetching;
      this.alreadyFetching = true;

      // Fetch file
      const data = await this.wrapped.readFile(name);
      if (!wasFetching) {
        this.triggerEventsAndCache(name, data.meta.lastModified);
      }
      return data;
    } finally {
      this.alreadyFetching = false;
    }
  }

  async writeFile(
    name: string,
    data: Uint8Array,
    selfUpdate?: boolean,
    meta?: FileMeta,
  ): Promise<FileMeta> {
    try {
      const wasFetching = this.alreadyFetching;
      this.alreadyFetching = true;
      const newMeta = await this.wrapped.writeFile(
        name,
        data,
        selfUpdate,
        meta,
      );
      if (!selfUpdate && !wasFetching) {
        await this.dispatchEvent(
          "file:changed",
          name,
          true,
          undefined,
          newMeta.lastModified,
        );
      }
      if (!wasFetching) {
        this.spaceSnapshot[name] = newMeta.lastModified;
      }

      if (name.endsWith(".md")) {
        // Let's trigger some page-specific events
        const pageName = name.substring(0, name.length - 3);
        let text = "";
        const decoder = new TextDecoder("utf-8");
        text = decoder.decode(data);

        await this.dispatchEvent("page:saved", pageName, newMeta);
        await this.dispatchEvent("page:index_text", {
          name: pageName,
          text,
        });
      }
      return newMeta;
    } finally {
      this.alreadyFetching = false;
    }
  }

  triggerEventsAndCache(name: string, newHash: number) {
    const oldHash = this.spaceSnapshot[name];
    if (oldHash && newHash && oldHash !== newHash) {
      // Page changed since last cached metadata, trigger event
      this.dispatchEvent("file:changed", name, false, oldHash, newHash);
    }
    this.spaceSnapshot[name] = newHash;
    return;
  }

  async getFileMeta(name: string): Promise<FileMeta> {
    try {
      const wasFetching = this.alreadyFetching;
      this.alreadyFetching = true;
      const newMeta = await this.wrapped.getFileMeta(name);
      if (!wasFetching) {
        this.triggerEventsAndCache(name, newMeta.lastModified);
      }
      return newMeta;
    } catch (e: any) {
      // console.log("Checking error", e, name);
      if (e.message === "Not found") {
        await this.dispatchEvent("file:deleted", name);
        if (name.endsWith(".md")) {
          const pageName = name.substring(0, name.length - 3);
          await this.dispatchEvent("page:deleted", pageName);
        }
      }
      throw e;
    } finally {
      this.alreadyFetching = false;
    }
  }

  async deleteFile(name: string): Promise<void> {
    try {
      this.alreadyFetching = true;
      if (name.endsWith(".md")) {
        const pageName = name.substring(0, name.length - 3);
        await this.dispatchEvent("page:deleted", pageName);
      }
      // await this.getPageMeta(name); // Check if page exists, if not throws Error
      await this.wrapped.deleteFile(name);
      delete this.spaceSnapshot[name];
      await this.dispatchEvent("file:deleted", name);
    } finally {
      this.alreadyFetching = false;
    }
  }
}
