#!/usr/bin/env python3
"""Test suite for check_budget_warnings.py.

This suite covers the threshold logic that determines whether a simulation report
triggers a CI failure. The critical boundary is 100% CPU utilization:
- utilization_pct >= 100.0 → CI fails (exit 1)
- utilization_pct < 100.0 → CI passes (exit 0)
"""

import json
import sys
from pathlib import Path

import pytest

# Import the module under test
sys.path.insert(0, str(Path(__file__).parent.parent))
from check_budget_warnings import check_report, main


class TestCheckReport:
    """Test the check_report function with various budget scenarios."""

    def test_no_warnings_clean(self, tmp_path):
        """A report with no budget or storage warnings should be CI-clean."""
        report = {
            "scenario_name": "test_scenario",
            "compute_budget_warnings": [],
            "storage_warnings": [],
        }
        report_file = tmp_path / "report.json"
        report_file.write_text(json.dumps(report))

        result = check_report(str(report_file))

        assert result is True, "Report with no warnings should return True"

    def test_cpu_below_threshold_clean(self, tmp_path):
        """CPU utilization below 100% is a warning but CI-clean (exit 0)."""
        report = {
            "scenario_name": "test_scenario",
            "compute_budget_warnings": [
                {
                    "step_index": 5,
                    "cpu_insns": 95_000_000,
                    "budget_limit": 100_000_000,
                    "utilization_pct": 95.0,
                }
            ],
            "storage_warnings": [],
        }
        report_file = tmp_path / "report.json"
        report_file.write_text(json.dumps(report))

        result = check_report(str(report_file))

        assert result is True, "95% utilization should be a warning but CI-clean"

    def test_cpu_at_boundary_99_9_percent_clean(self, tmp_path):
        """CPU utilization at 99.9% (just below threshold) should be CI-clean."""
        report = {
            "scenario_name": "test_scenario",
            "compute_budget_warnings": [
                {
                    "step_index": 3,
                    "cpu_insns": 99_900_000,
                    "budget_limit": 100_000_000,
                    "utilization_pct": 99.9,
                }
            ],
            "storage_warnings": [],
        }
        report_file = tmp_path / "report.json"
        report_file.write_text(json.dumps(report))

        result = check_report(str(report_file))

        assert result is True, "99.9% utilization should still be CI-clean"

    def test_cpu_exactly_100_percent_critical(self, tmp_path):
        """CPU utilization exactly at 100% crosses into CRITICAL and fails CI."""
        report = {
            "scenario_name": "test_scenario",
            "compute_budget_warnings": [
                {
                    "step_index": 7,
                    "cpu_insns": 100_000_000,
                    "budget_limit": 100_000_000,
                    "utilization_pct": 100.0,
                }
            ],
            "storage_warnings": [],
        }
        report_file = tmp_path / "report.json"
        report_file.write_text(json.dumps(report))

        result = check_report(str(report_file))

        assert result is False, "100.0% utilization should trigger CI failure"

    def test_cpu_above_threshold_critical(self, tmp_path):
        """CPU utilization above 100% is CRITICAL and fails CI."""
        report = {
            "scenario_name": "test_scenario",
            "compute_budget_warnings": [
                {
                    "step_index": 2,
                    "cpu_insns": 105_000_000,
                    "budget_limit": 100_000_000,
                    "utilization_pct": 105.0,
                }
            ],
            "storage_warnings": [],
        }
        report_file = tmp_path / "report.json"
        report_file.write_text(json.dumps(report))

        result = check_report(str(report_file))

        assert result is False, "105% utilization should trigger CI failure"

    def test_multiple_warnings_any_critical_fails(self, tmp_path):
        """If any CPU warning is >= 100%, the report fails even if others pass."""
        report = {
            "scenario_name": "test_scenario",
            "compute_budget_warnings": [
                {
                    "step_index": 1,
                    "cpu_insns": 80_000_000,
                    "budget_limit": 100_000_000,
                    "utilization_pct": 80.0,
                },
                {
                    "step_index": 5,
                    "cpu_insns": 100_000_000,
                    "budget_limit": 100_000_000,
                    "utilization_pct": 100.0,
                },
                {
                    "step_index": 10,
                    "cpu_insns": 90_000_000,
                    "budget_limit": 100_000_000,
                    "utilization_pct": 90.0,
                },
            ],
            "storage_warnings": [],
        }
        report_file = tmp_path / "report.json"
        report_file.write_text(json.dumps(report))

        result = check_report(str(report_file))

        assert result is False, "Any CRITICAL warning should fail the entire report"

    def test_storage_warnings_advisory_only(self, tmp_path):
        """Storage warnings are printed but do not affect CI status."""
        report = {
            "scenario_name": "test_scenario",
            "compute_budget_warnings": [],
            "storage_warnings": [
                {
                    "step_index": 4,
                    "entries_written": 1500,
                    "utilization_pct": 75.0,
                }
            ],
        }
        report_file = tmp_path / "report.json"
        report_file.write_text(json.dumps(report))

        result = check_report(str(report_file))

        assert result is True, "Storage warnings alone should not fail CI"

    def test_storage_and_cpu_warning_both_below_threshold_clean(self, tmp_path):
        """Both storage and CPU warnings below threshold should be CI-clean."""
        report = {
            "scenario_name": "test_scenario",
            "compute_budget_warnings": [
                {
                    "step_index": 3,
                    "cpu_insns": 85_000_000,
                    "budget_limit": 100_000_000,
                    "utilization_pct": 85.0,
                }
            ],
            "storage_warnings": [
                {
                    "step_index": 4,
                    "entries_written": 1200,
                    "utilization_pct": 60.0,
                }
            ],
        }
        report_file = tmp_path / "report.json"
        report_file.write_text(json.dumps(report))

        result = check_report(str(report_file))

        assert result is True, "Both warnings below threshold should be CI-clean"

    def test_malformed_json_raises_exception(self, tmp_path):
        """Malformed JSON input should raise JSONDecodeError (caught by main())."""
        report_file = tmp_path / "bad_report.json"
        report_file.write_text("{this is not valid json")

        # check_report does not catch JSONDecodeError - main() does
        # Verify the exception is raised as expected
        import json
        with pytest.raises(json.JSONDecodeError):
            check_report(str(report_file))

    def test_missing_scenario_name_uses_path(self, tmp_path):
        """If scenario_name is missing, the file path should be used as fallback."""
        report = {
            "compute_budget_warnings": [],
            "storage_warnings": [],
        }
        report_file = tmp_path / "report_no_name.json"
        report_file.write_text(json.dumps(report))

        # This test primarily checks that missing scenario_name doesn't crash
        result = check_report(str(report_file))

        assert result is True, "Report without scenario_name should still be processed"


class TestMain:
    """Test the main() function CLI behavior."""

    def test_main_no_args_prints_help(self, capsys, monkeypatch):
        """Running with no arguments should print usage and return exit 1."""
        monkeypatch.setattr(sys, "argv", ["check_budget_warnings.py"])

        exit_code = main()

        assert exit_code == 1
        captured = capsys.readouterr()
        assert "Usage:" in captured.out

    def test_main_single_clean_report_exits_0(self, tmp_path, monkeypatch):
        """A single clean report should exit with code 0."""
        report = {
            "scenario_name": "clean_scenario",
            "compute_budget_warnings": [],
            "storage_warnings": [],
        }
        report_file = tmp_path / "clean.json"
        report_file.write_text(json.dumps(report))

        monkeypatch.setattr(sys, "argv", ["check_budget_warnings.py", str(report_file)])

        exit_code = main()

        assert exit_code == 0

    def test_main_single_critical_report_exits_1(self, tmp_path, monkeypatch):
        """A single report with CRITICAL warning should exit with code 1."""
        report = {
            "scenario_name": "critical_scenario",
            "compute_budget_warnings": [
                {
                    "step_index": 1,
                    "cpu_insns": 100_000_000,
                    "budget_limit": 100_000_000,
                    "utilization_pct": 100.0,
                }
            ],
            "storage_warnings": [],
        }
        report_file = tmp_path / "critical.json"
        report_file.write_text(json.dumps(report))

        monkeypatch.setattr(sys, "argv", ["check_budget_warnings.py", str(report_file)])

        exit_code = main()

        assert exit_code == 1

    def test_main_multiple_reports_any_fail_exits_1(self, tmp_path, monkeypatch):
        """If any report fails, main should exit 1 even if others pass."""
        clean_report = {
            "scenario_name": "clean",
            "compute_budget_warnings": [],
            "storage_warnings": [],
        }
        clean_file = tmp_path / "clean.json"
        clean_file.write_text(json.dumps(clean_report))

        critical_report = {
            "scenario_name": "critical",
            "compute_budget_warnings": [
                {
                    "step_index": 5,
                    "cpu_insns": 102_000_000,
                    "budget_limit": 100_000_000,
                    "utilization_pct": 102.0,
                }
            ],
            "storage_warnings": [],
        }
        critical_file = tmp_path / "critical.json"
        critical_file.write_text(json.dumps(critical_report))

        monkeypatch.setattr(
            sys,
            "argv",
            ["check_budget_warnings.py", str(clean_file), str(critical_file)],
        )

        exit_code = main()

        assert exit_code == 1

    def test_main_file_not_found_exits_1(self, monkeypatch, capsys):
        """If a report file doesn't exist, main should exit 1 and print error."""
        monkeypatch.setattr(
            sys, "argv", ["check_budget_warnings.py", "/nonexistent/report.json"]
        )

        exit_code = main()

        assert exit_code == 1
        captured = capsys.readouterr()
        assert "error reading" in captured.err
