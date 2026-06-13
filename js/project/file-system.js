/**
 * AI-Xcode IDE — Virtual File System
 * IndexedDB-backed VFS with in-memory cache, debounced saves,
 * full CRUD, search, import/export, and change watching.
 *
 * @module file-system
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'ai-xcode-fs';
const DB_VERSION = 1;
const STORE_NAME = 'files';
const DEBOUNCE_MS = 500;
const ROOT_ID = 'root';

// Extension → language mapping
const EXT_LANG_MAP = {
  '.swift': 'swift',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.json': 'json',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.plist': 'xml',
  '.xml': 'xml',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.sh': 'shell',
  '.sql': 'sql',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.txt': 'plaintext',
};

// Reverse map for stats
const LANG_LABELS = {
  swift: 'Swift',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  markdown: 'Markdown',
  xml: 'XML',
  cpp: 'C++',
  rust: 'Rust',
  go: 'Go',
  java: 'Java',
  kotlin: 'Kotlin',
  shell: 'Shell',
  sql: 'SQL',
  yaml: 'YAML',
  toml: 'TOML',
  plaintext: 'Plain Text',
  scss: 'SCSS',
};

// ─────────────────────────────────────────────────────────────────────────────
// Default project files (created on first load)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PROJECT = [
  // ── MyApp/ ──────────────────────────────────────────────────────────────
  {
    path: 'MyApp/AppDelegate.swift',
    language: 'swift',
    content: `//
//  AppDelegate.swift
//  MyApp
//

import UIKit
import SwiftUI

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    // MARK: UISceneSession Lifecycle

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }
}
`,
  },
  {
    path: 'MyApp/ContentView.swift',
    language: 'swift',
    content: `//
//  ContentView.swift
//  MyApp
//

import SwiftUI

struct ContentView: View {
    @State private var isLoggedIn = false

    var body: some View {
        VStack {
            if isLoggedIn {
                Text("Welcome to MyApp!")
                    .font(.largeTitle)
                    .fontWeight(.bold)
            } else {
                Text("Please log in")
                    .font(.title)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
    }
}

#Preview {
    ContentView()
}
`,
  },
  // ── MyApp/Models/ ──────────────────────────────────────────────────────
  {
    path: 'MyApp/Models/User.swift',
    language: 'swift',
    content: `//
//  User.swift
//  MyApp
//

import Foundation

struct User: Identifiable, Codable {
    let id: UUID
    var username: String
    var email: String
    var avatarURL: String?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        username: String,
        email: String,
        avatarURL: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.username = username
        self.email = email
        self.avatarURL = avatarURL
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
`,
  },
  // ── MyApp/Views/ ──────────────────────────────────────────────────────
  {
    path: 'MyApp/Views/LoginView.swift',
    language: 'swift',
    content: `//
//  LoginView.swift
//  MyApp
//

import SwiftUI

struct LoginView: View {
    @State private var username = ""
    @State private var password = ""
    @State private var showError = false
    @State private var errorMessage = ""

    var body: some View {
        VStack(spacing: 20) {
            Text("Login")
                .font(.largeTitle)
                .fontWeight(.bold)

            VStack(spacing: 12) {
                TextField("Username", text: $username)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .autocapitalization(.none)

                SecureField("Password", text: $password)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
            }
            .padding(.horizontal)

            Button(action: handleLogin) {
                Text("Sign In")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(10)
            }
            .padding(.horizontal)

            if showError {
                Text(errorMessage)
                    .foregroundColor(.red)
                    .font(.caption)
            }
        }
    }

    private func handleLogin() {
        // TODO: Implement authentication
        showError = false
    }
}

#Preview {
    LoginView()
}
`,
  },
  {
    path: 'MyApp/Views/DashboardView.swift',
    language: 'swift',
    content: `//
//  DashboardView.swift
//  MyApp
//

import SwiftUI

struct DashboardView: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView()
                .tabItem {
                    Image(systemName: "house")
                    Text("Home")
                }
                .tag(0)

            SettingsView()
                .tabItem {
                    Image(systemName: "gear")
                    Text("Settings")
                }
                .tag(1)
        }
    }
}

struct HomeView: View {
    var body: some View {
        NavigationView {
            List {
                Text("Dashboard Content Goes Here")
            }
            .navigationTitle("Dashboard")
        }
    }
}

struct SettingsView: View {
    var body: some View {
        NavigationView {
            List {
                Section(header: "General") {
                    Toggle("Notifications", isOn: .constant(true))
                    Toggle("Dark Mode", isOn: .constant(false))
                }
            }
            .navigationTitle("Settings")
        }
    }
}

#Preview {
    DashboardView()
}
`,
  },
  // ── MyApp/Tests/ ──────────────────────────────────────────────────────
  {
    path: 'MyApp/Tests/MyAppTests.swift',
    language: 'swift',
    content: `//
//  MyAppTests.swift
//  MyApp
//

import XCTest
@testable import MyApp

final class MyAppTests: XCTestCase {

    override func setUpWithError() throws {
        // Put setup code here. This method is called before each test.
    }

    override func tearDownWithError() throws {
        // Put teardown code here. This method is called after each test.
    }

    func testUserInitialization() throws {
        let user = User(username: "testuser", email: "test@example.com")
        XCTAssertEqual(user.username, "testuser")
        XCTAssertEqual(user.email, "test@example.com")
        XCTAssertNil(user.avatarURL)
    }

    func testUserEncodingDecoding() throws {
        let user = User(username: "encode", email: "encode@test.com")
        let data = try JSONEncoder().encode(user)
        let decoded = try JSONDecoder().decode(User.self, from: data)
        XCTAssertEqual(decoded.username, user.username)
    }

    func testPerformanceExample() throws {
        measure {
            // Performance test body
        }
    }
}
`,
  },
  // ── MyApp/Assets/ ─────────────────────────────────────────────────────
  {
    path: 'MyApp/Assets/AppIcon',
    language: 'plaintext',
    content: `# AppIcon Placeholder
# Replace this with actual app icon assets (1024x1024 PNG)
# Add to Assets.xcassets / AppIcon.appiconset
`,
  },
  // ── MyApp/Info.plist ──────────────────────────────────────────────────
  {
    path: 'MyApp/Info.plist',
    language: 'xml',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSRequiresIPhoneOS</key>
    <true/>
    <key>UIApplicationSceneManifest</key>
    <dict>
        <key>UIApplicationSupportsMultipleScenes</key>
        <false/>
    </dict>
    <key>UILaunchStoryboardName</key>
    <string>LaunchScreen</string>
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
    </array>
</dict>
</plist>
`,
  },
  // ── README.md ─────────────────────────────────────────────────────────
  {
    path: 'MyApp/README.md',
    language: 'markdown',
    content: `# MyApp

A sample iOS application built with SwiftUI.

## Features

- User authentication
- Dashboard with tabs
- Settings management

## Requirements

- iOS 16.0+
- Xcode 15+
- Swift 5.9+

## Installation

1. Clone the repository
2. Open \`MyApp.xcodeproj\` in Xcode
3. Build and run (\`⌘R\`)

## License

MIT License
`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a unique ID.
 * @returns {string}
 */
function _uid() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

/**
 * Normalize a path — trim leading/trailing slashes, collapse double slashes.
 * @param {string} path
 * @returns {string}
 */
function _normalizePath(path) {
  if (typeof path !== 'string') return '';
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/{2,}/g, '/');
}

/**
 * Extract the basename from a path.
 * @param {string} path
 * @returns {string}
 */
function _basename(path) {
  const p = _normalizePath(path);
  const idx = p.lastIndexOf('/');
  return idx === -1 ? p : p.slice(idx + 1);
}

/**
 * Extract the parent directory path.
 * @param {string} path
 * @returns {string}
 */
function _dirname(path) {
  const p = _normalizePath(path);
  const idx = p.lastIndexOf('/');
  return idx === -1 ? '' : p.slice(0, idx);
}

/**
 * Extract file extension (lowercase, including dot).
 * @param {string} name
 * @returns {string}
 */
function _extname(name) {
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return ''; // hidden files like .gitignore → treat as no ext
  return name.slice(idx).toLowerCase();
}

/**
 * Simple debounce.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
function _debounce(fn, ms) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Virtual File System Class
// ─────────────────────────────────────────────────────────────────────────────

export class VirtualFileSystem {
  /**
   * @param {object} [opts]
   * @param {string} [opts.dbName]  Override database name.
   * @param {string} [opts.storeName] Override store name.
   * @param {number} [opts.debounceMs] Override debounce interval.
   */
  constructor(opts = {}) {
    this.dbName = opts.dbName || DB_NAME;
    this.storeName = opts.storeName || STORE_NAME;
    this.debounceMs = opts.debounceMs || DEBOUNCE_MS;

    /** @type {IDBDatabase|null} */
    this._db = null;

    /** In-memory cache: Map<path, fileNode> */
    this._cache = new Map();

    /** Watchers registered via watch() */
    this._watchers = new Set();

    /** Dirty flag set when cache diverges from IndexedDB */
    this._dirty = false;

    // Debounced bulk flush
    this._flush = _debounce(() => this._persist(), this.debounceMs);

    this._initialized = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IndexedDB low-level helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Open or create the IndexedDB database.
   * @returns {Promise<IDBDatabase>}
   */
  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'path' });
          store.createIndex('parentId', 'parentId', { unique: false });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Read all records from IndexedDB into the cache.
   * @returns {Promise<void>}
   */
  async _loadAllFromDB() {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.getAll();

      req.onsuccess = () => {
        const records = req.result || [];
        this._cache.clear();
        for (const r of records) {
          this._cache.set(r.path, r);
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Persist the entire cache to IndexedDB (debounced caller).
   * Replaces all records.
   * @returns {Promise<void>}
   */
  _persist() {
    if (!this._db) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.clear();

      let count = 0;
      const entries = Array.from(this._cache.values());
      for (const node of entries) {
        store.put(node);
        count++;
      }

      tx.oncomplete = () => {
        this._dirty = false;
        resolve(count);
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Persist a single record immediately (bypass debounce).
   * @param {object} node
   * @returns {Promise<void>}
   */
  _persistNode(node) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(node);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Remove a record by path immediately.
   * @param {string} path
   * @returns {Promise<void>}
   */
  _deleteNodeFromDB(path) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).delete(path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Initialisation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialise the VFS — open DB, load from IndexedDB, or seed default project.
   * @returns {Promise<void>}
   */
  async init() {
    if (this._initialized) return;

    this._db = await this._openDB();
    await this._loadAllFromDB();

    if (this._cache.size === 0) {
      await this._seedDefaultProject();
    }

    this._initialized = true;
    this._notify('init');
  }

  /**
   * Populate the default project structure.
   * @returns {Promise<void>}
   */
  async _seedDefaultProject() {
    for (const entry of DEFAULT_PROJECT) {
      // Create folder chain first (idempotent)
      const parts = entry.path.split('/');
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        if (!this._cache.has(currentPath)) {
          this._putNode({
            id: _uid(),
            path: currentPath,
            name: parts[i],
            content: '',
            language: 'plaintext',
            parentId: _dirname(currentPath),
            isFolder: true,
            children: [],
            createdAt: Date.now(),
            modifiedAt: Date.now(),
            isOpen: false,
          });
        }
      }

      // Create the file
      this._putNode({
        id: _uid(),
        path: entry.path,
        name: _basename(entry.path),
        content: entry.content,
        language: entry.language || this.getFileLanguage(entry.path),
        parentId: _dirname(entry.path),
        isFolder: false,
        children: [],
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        isOpen: false,
      });
    }

    // Persist immediately
    await this._persist();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Cache manipulation helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Insert or update a node in the cache and mark dirty.
   * @param {object} node
   */
  _putNode(node) {
    this._cache.set(node.path, node);
    this._dirty = true;
  }

  /**
   * Remove a node from the cache and mark dirty.
   * @param {string} path
   */
  _removeNode(path) {
    this._cache.delete(path);
    this._dirty = true;
  }

  /**
   * Schedule a debounced persist.
   */
  _scheduleSave() {
    this._dirty = true;
    this._flush();
  }

  /**
   * Notify all registered watchers.
   * @param {string} eventType
   * @param {*} [data]
   */
  _notify(eventType, data) {
    for (const cb of this._watchers) {
      try {
        cb({ type: eventType, data, timestamp: Date.now() });
      } catch (e) {
        // Swallow watcher errors so they don't break the VFS
        console.error('[VFS] Watcher error:', e);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API — File / Folder operations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new file.
   * @param {string} path      Full path (e.g. "MyApp/foo.txt")
   * @param {string} [content]
   * @param {string} [language]
   * @returns {Promise<object>} The created file node.
   * @throws If path is invalid or already exists.
   */
  async createFile(path, content = '', language) {
    path = _normalizePath(path);
    if (!path) throw new Error('Invalid path: path cannot be empty.');

    if (this._cache.has(path)) {
      throw new Error(`A file or folder already exists at "${path}".`);
    }

    const name = _basename(path);
    const parentId = _dirname(path);

    // Ensure parent folder chain exists
    await this._ensureFolders(parentId);

    const now = Date.now();
    const node = {
      id: _uid(),
      path,
      name,
      content,
      language: language || this.getFileLanguage(path),
      parentId,
      isFolder: false,
      children: [],
      createdAt: now,
      modifiedAt: now,
      isOpen: false,
    };

    this._putNode(node);
    this._scheduleSave();
    this._notify('create', { path, type: 'file' });
    return node;
  }

  /**
   * Create a new folder.
   * @param {string} path
   * @returns {Promise<object>} The created folder node.
   * @throws If path is invalid or already exists.
   */
  async createFolder(path) {
    path = _normalizePath(path);
    if (!path) throw new Error('Invalid path: path cannot be empty.');

    if (this._cache.has(path)) {
      throw new Error(`A file or folder already exists at "${path}".`);
    }

    const name = _basename(path);
    const parentId = _dirname(path);

    // Ensure parent folders
    await this._ensureFolders(parentId);

    const now = Date.now();
    const node = {
      id: _uid(),
      path,
      name,
      content: '',
      language: 'plaintext',
      parentId,
      isFolder: true,
      children: [],
      createdAt: now,
      modifiedAt: now,
      isOpen: false,
    };

    this._putNode(node);
    this._scheduleSave();
    this._notify('create', { path, type: 'folder' });
    return node;
  }

  /**
   * Read the content of a file.
   * @param {string} path
   * @returns {Promise<string>} File content.
   * @throws If file does not exist or is a folder.
   */
  async readFile(path) {
    path = _normalizePath(path);
    const node = this._cache.get(path);
    if (!node) throw new Error(`File not found: "${path}".`);
    if (node.isFolder) throw new Error(`"${path}" is a folder, not a file.`);
    return node.content;
  }

  /**
   * Write (update) file content.
   * @param {string} path
   * @param {string} content
   * @returns {Promise<object>} The updated file node.
   * @throws If file does not exist or is a folder.
   */
  async writeFile(path, content) {
    path = _normalizePath(path);
    const node = this._cache.get(path);
    if (!node) throw new Error(`File not found: "${path}".`);
    if (node.isFolder) throw new Error(`Cannot write content to a folder: "${path}".`);

    node.content = content;
    node.modifiedAt = Date.now();

    this._putNode(node);
    this._scheduleSave();
    this._notify('update', { path, type: 'file' });
    return node;
  }

  /**
   * Delete a file or folder (recursively for folders).
   * @param {string} path
   * @returns {Promise<number>} Number of nodes deleted.
   * @throws If path does not exist.
   */
  async deleteFile(path) {
    path = _normalizePath(path);
    const node = this._cache.get(path);
    if (!node) throw new Error(`Path not found: "${path}".`);

    const toDelete = [];

    // Collect all descendants (for folders) plus the node itself
    const collect = (p) => {
      const n = this._cache.get(p);
      if (!n) return;
      toDelete.push(p);
      // Find direct children
      for (const candidate of this._cache.values()) {
        if (candidate.parentId === p) {
          collect(candidate.path);
        }
      }
    };

    collect(path);

    // Delete from cache and DB
    for (const p of toDelete) {
      this._removeNode(p);
      try {
        await this._deleteNodeFromDB(p);
      } catch {
        // best-effort; full persist will reconcile
      }
    }

    this._dirty = true;
    this._scheduleSave();
    this._notify('delete', { path, deletedCount: toDelete.length });
    return toDelete.length;
  }

  /**
   * Rename or move a file/folder.
   * @param {string} oldPath
   * @param {string} newPath
   * @returns {Promise<object>} The renamed node (at newPath).
   * @throws If oldPath doesn't exist or newPath already exists.
   */
  async renameFile(oldPath, newPath) {
    oldPath = _normalizePath(oldPath);
    newPath = _normalizePath(newPath);

    if (!oldPath || !newPath) throw new Error('Invalid path(s).');
    if (oldPath === newPath) return this._cache.get(oldPath);

    const node = this._cache.get(oldPath);
    if (!node) throw new Error(`Source not found: "${oldPath}".`);
    if (this._cache.has(newPath)) throw new Error(`Destination already exists: "${newPath}".`);

    // Prevent circular references: newPath cannot be inside oldPath
    if (newPath.startsWith(oldPath + '/')) {
      throw new Error(`Cannot move "${oldPath}" into itself ("${newPath}").`);
    }

    // Ensure parent of newPath exists
    const newParentId = _dirname(newPath);
    if (newParentId && !this._cache.has(newParentId)) {
      await this._ensureFolders(newParentId);
    }

    // Collect all nodes to update (node + descendants)
    const toUpdate = [];
    const collect = (p) => {
      const n = this._cache.get(p);
      if (!n) return;
      toUpdate.push(n);
      for (const c of this._cache.values()) {
        if (c.parentId === p) collect(c.path);
      }
    };
    collect(oldPath);

    const now = Date.now();

    for (const n of toUpdate) {
      const oldP = n.path;
      const newP = oldP === oldPath ? newPath : oldP.replace(oldPath, newPath);

      // Remove old cache entry
      this._cache.delete(oldP);
      try {
        await this._deleteNodeFromDB(oldP);
      } catch { /* best-effort */ }

      // Update node fields
      n.path = newP;
      n.name = _basename(newP);
      n.parentId = _dirname(newP);
      n.modifiedAt = now;

      // Re-insert
      this._cache.set(newP, n);
      await this._persistNode(n);
    }

    this._dirty = true;
    this._scheduleSave();
    this._notify('rename', { oldPath, newPath });
    return this._cache.get(newPath);
  }

  /**
   * Check if a path exists.
   * @param {string} path
   * @returns {Promise<boolean>}
   */
  async exists(path) {
    path = _normalizePath(path);
    return this._cache.has(path);
  }

  /**
   * List the children of a directory.
   * @param {string} path  Parent directory path (empty string = root).
   * @returns {Promise<object[]>} Array of child nodes.
   * @throws If path exists but is not a folder.
   */
  async listDirectory(path) {
    path = _normalizePath(path); // '' for root

    // If a non-empty path is given, validate it's a folder
    if (path) {
      const node = this._cache.get(path);
      if (!node) throw new Error(`Directory not found: "${path}".`);
      if (!node.isFolder) throw new Error(`"${path}" is not a folder.`);
    }

    const children = [];
    for (const n of this._cache.values()) {
      if (n.parentId === path) {
        children.push(n);
      }
    }

    // Sort: folders first, then alphabetical
    children.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return children;
  }

  /**
   * Return the full tree structure for rendering.
   * @returns {Promise<object[]>} Array of top-level tree nodes.
   */
  async getTree() {
    const buildNode = (node) => {
      const children = [];
      for (const n of this._cache.values()) {
        if (n.parentId === node.path) {
          children.push(buildNode(n));
        }
      }
      children.sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return {
        id: node.id,
        path: node.path,
        name: node.name,
        language: node.language,
        isFolder: node.isFolder,
        isOpen: node.isOpen,
        modifiedAt: node.modifiedAt,
        children,
      };
    };

    // Find root-level nodes (parentId === '')
    const roots = [];
    for (const n of this._cache.values()) {
      if (n.parentId === '') {
        roots.push(buildNode(n));
      }
    }
    roots.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return roots;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Stats & Import / Export
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Return project statistics.
   * @returns {Promise<object>} { fileCount, folderCount, totalLines, languages }
   */
  async getProjectStats() {
    let fileCount = 0;
    let folderCount = 0;
    let totalLines = 0;
    const langSet = new Set();

    for (const node of this._cache.values()) {
      if (node.isFolder) {
        folderCount++;
      } else {
        fileCount++;
        langSet.add(node.language);
        if (node.content) {
          totalLines += node.content.split('\n').length;
        }
      }
    }

    return {
      fileCount,
      folderCount,
      totalLines,
      languages: Array.from(langSet).map((l) => ({
        id: l,
        label: LANG_LABELS[l] || l,
      })),
    };
  }

  /**
   * Export all files as a JSON-serializable object.
   * @returns {Promise<object>} { version, exportedAt, files: [...] }
   */
  async exportProject() {
    const files = [];
    for (const node of this._cache.values()) {
      if (!node.isFolder) {
        files.push({
          path: node.path,
          content: node.content,
          language: node.language,
        });
      }
    }

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      files,
    };
  }

  /**
   * Import a project from JSON (as produced by exportProject).
   * Replaces the current project.
   * @param {object|string} json
   * @returns {Promise<number>} Number of files imported.
   */
  async importProject(json) {
    let data;
    if (typeof json === 'string') {
      data = JSON.parse(json);
    } else {
      data = json;
    }

    if (!data || !Array.isArray(data.files)) {
      throw new Error('Invalid project JSON: expected { files: [...] }.');
    }

    // Clear everything
    this._cache.clear();
    try {
      const tx = this._db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).clear();
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch { /* best-effort */ }

    const now = Date.now();

    for (const f of data.files) {
      const path = _normalizePath(f.path);

      // Ensure folder chain
      const parts = path.split('/');
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        if (!this._cache.has(currentPath)) {
          this._putNode({
            id: _uid(),
            path: currentPath,
            name: parts[i],
            content: '',
            language: 'plaintext',
            parentId: _dirname(currentPath),
            isFolder: true,
            children: [],
            createdAt: now,
            modifiedAt: now,
            isOpen: false,
          });
        }
      }

      this._putNode({
        id: _uid(),
        path,
        name: _basename(path),
        content: f.content || '',
        language: f.language || this.getFileLanguage(path),
        parentId: _dirname(path),
        isFolder: false,
        children: [],
        createdAt: now,
        modifiedAt: now,
        isOpen: false,
      });
    }

    await this._persist();
    this._notify('import', { count: data.files.length });
    return data.files.length;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Search
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Search across all file contents.
   * @param {string} query
   * @param {object} [options]
   * @param {boolean} [options.caseSensitive=false]
   * @param {boolean} [options.regex=false]
   * @param {boolean} [options.wholeWord=false]
   * @param {boolean} [options.foldersOnly=false]
   * @param {string} [options.filePattern]  Glob-like filter, e.g. "*.swift".
   * @returns {Promise<object[]>} Array of { file, line, lineNum, match }
   */
  async searchInFiles(query, options = {}) {
    if (!query) return [];

    const {
      caseSensitive = false,
      regex = false,
      wholeWord = false,
      filePattern = null,
    } = options;

    // Build the RegExp
    let pattern;
    try {
      let q = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) q = `\\b${q}\\b`;
      pattern = new RegExp(q, caseSensitive ? 'g' : 'gi');
    } catch (e) {
      throw new Error(`Invalid search pattern: ${e.message}`);
    }

    const results = [];
    let globRe = null;
    if (filePattern) {
      const g = filePattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      globRe = new RegExp(`^${g}$`, 'i');
    }

    for (const node of this._cache.values()) {
      if (node.isFolder) continue;
      if (globRe && !globRe.test(node.name)) continue;
      if (!node.content) continue;

      const lines = node.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        pattern.lastIndex = 0;
        const m = pattern.exec(lines[i]);
        if (m) {
          results.push({
            file: node.path,
            line: lines[i],
            lineNum: i + 1,
            match: m[0],
          });
        }
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Language detection
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Determine language from file extension.
   * @param {string} path
   * @returns {string} Language identifier.
   */
  getFileLanguage(path) {
    const ext = _extname(_basename(path));
    return EXT_LANG_MAP[ext] || 'plaintext';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Watch / Reactivity
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register a change callback.
   * @param {function} callback  Receives { type, data, timestamp }.
   * @returns {function} Unsubscribe function.
   */
  watch(callback) {
    if (typeof callback !== 'function') {
      throw new Error('watch() callback must be a function.');
    }
    this._watchers.add(callback);
    return () => {
      this._watchers.delete(callback);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Internal helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Ensure all ancestor folders exist for a given parent path.
   * @param {string} parentId
   * @returns {Promise<void>}
   */
  async _ensureFolders(parentId) {
    if (!parentId) return; // root level

    const parts = parentId.split('/');
    let current = '';
    const now = Date.now();

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this._cache.has(current)) {
        this._putNode({
          id: _uid(),
          path: current,
          name: part,
          content: '',
          language: 'plaintext',
          parentId: _dirname(current),
          isFolder: true,
          children: [],
          createdAt: now,
          modifiedAt: now,
          isOpen: false,
        });
      }
    }
  }

  /**
   * Force an immediate flush of pending writes to IndexedDB.
   * @returns {Promise<void>}
   */
  async flush() {
    if (this._dirty) {
      await this._persist();
    }
  }

  /**
   * Close the database connection.
   * @returns {Promise<void>}
   */
  async close() {
    await this.flush();
    if (this._db) {
      this._db.close();
      this._db = null;
    }
    this._initialized = false;
  }
}

export default VirtualFileSystem;
