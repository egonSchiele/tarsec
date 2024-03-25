import { trace } from "@/lib/trace";
import {
  GeneralParser,
  MergedResults,
  MergedCaptures,
  Parser,
  createTree,
  isCaptureResult,
  success,
} from "@/lib/types";
import { findAncestorWithNextParser, popMany } from "@/lib/utils";
import { getCaptures, getResults } from "../combinators";
