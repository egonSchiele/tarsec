import { trace } from "@/lib/trace.js";
import {
  GeneralParser,
  MergedResults,
  MergedCaptures,
  Parser,
  createTree,
  isCaptureResult,
  success,
} from "@/lib/types.js";
import { findAncestorWithNextParser, popMany } from "@/lib/utils.js";
import { getCaptures, getResults } from "../combinators.js";
