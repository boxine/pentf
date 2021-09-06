import { Page } from 'puppeteer';
import { AxeResults } from 'axe-core';
import { Config } from './config';

export interface TestFile {
    fileName: string;
    name: string;
}

export type TestCase = {
    fileName: string;
    name: string;
    group: string;
    resources?: string[];
    run: (config: TaskConfig) => Promise<void> | void;
    skip?: (config: TaskConfig) => Promise<boolean> | boolean;
    expectedToFail?: string | boolean;
};

export type TaskStatus = 'success' | 'running' | 'error' | 'todo' | 'skipped';

export interface Task {
    id: string;
    /** Name of the task */
    name: string;
    /** The name of the group this task belongs to. This is used for repeatFlaky */
    group: string;
    tc: TestCase;
    status: TaskStatus;
    start: number;
    breadcrumb: Error | null;
    pageUrls: string[];
    skipReason?: boolean;
    error_screenshots: Buffer[];
    resources: string[];
    expectedToFail?:
        | boolean
        | string
        | ((config: import('./config').Config) => boolean);
    accessibilityErrors: A11yResult[];
}

export type TeardownHook = (config: TaskConfig) => Promise<void> | void;

export interface VideoRecorder {
    start(options: {
        width: number;
        height: number;
        outputFile: string;
    }): Promise<void>;
    stop(): Promise<void>;
}

export interface TaskConfig extends Config {
    _teardown_hooks: TeardownHook[];
    _browser_pages: Page[];
    _breadcrumb: Error | null;
    _testName: string;
    _taskName: string;
    _taskGroup: string;
    _video_counter: number;
    _video_recorder: null | VideoRecorder;
    error: Error | null;
    resources: string[];
    _snapshots: Buffer[];
    accessibilityErrors: A11yResult[];
}

export interface TaskResult {
    pageUrls: string[];
    status: TaskStatus;
    /** in milliseconds */
    duration: number;
    error_screenshots: Buffer[];
    error_stack?: string;
    axeResults: AxeResults[];
}

export type TestStatus = TaskStatus | 'flaky';

export interface TestResult {
    name: string;
    group: string;
    id: string;
    description: string;
    skipped: boolean;
    taskResults: TaskResult[];
    status: TestStatus;
    expectedToFail: any;
    skipReason: any;
}

export interface CraftedResults {
    start: number;
    duration: number;
    config: import('./config').Config;
    tests: TestResult[];
    pentfVersion: string;
    testsVersion: string;
}

export interface RunnerState {
    tasks: Task[];
    locks?: Set<string>;
    external_locking_refresh_timeout?: NodeJS.Timeout;
    /** The last status string that was logged to the console. */
    last_logged_status: string;
    /** Track flakyness run count of a test */
    flakyCounts: Map<string, number>;
    resultByTaskGroup: Map<string, TestResult>;
    /**
     * Pending teardown hooks, most likely open browser windows
     * that were kept open when a test failed
     */
    remaining_teardowns: () => Promise<void>;
}

export interface RunnerResult {
    test_start: number;
    test_end: number;
    state: RunnerState;
    pentfVersion: string;
    testsVersion: string;
}

//
// Suite-API
//
export type TestOptions = Omit<TestCase, 'name' | 'run'>;

export interface TestFn {
    (
        name: string,
        test: (config: TaskConfig) => Promise<void> | void,
        options?: TestOptions
    ): void;
    /** Only run this test case in the current file */
    only: (
        name: string,
        test: (config: TaskConfig) => Promise<void> | void,
        options?: TestOptions
    ) => void;
    /** Skip this test case */
    skip: (
        name: string,
        test: (config: TaskConfig) => Promise<void> | void,
        options?: TestOptions
    ) => void;
}

export interface DescribeFn {
    (name: string, callback: () => void): void;
    /** Only run this group in the current file */
    only: (name: string, callback: () => void) => void;
    /** Skip this group */
    skip: (name: string, callback: () => void) => void;
}

export type SuiteBuilder = (test: TestFn, suite: DescribeFn) => void;

//
// Accessibility
//
export type A11yImpact = 'minor' | 'moderate' | 'serious' | 'critical';

export type A11yNode = {
    html: string;
    screenshots: Array<Buffer | null>;
    selectors: string[];
};

export type A11yResult = {
    impact: A11yImpact;
    helpUrl?: string;
    description: string;
    nodes: A11yNode[];
};
