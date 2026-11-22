import {
  approvedBEDegreeList,
  approvedBPharmDegreeList,
  type approvedDegreeList,
  approvedMScDegreeList,
} from "lib";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type Degree = (typeof approvedDegreeList)[number];

// typed by lib's list, so a new degree code fails the build until it has a name
const DEGREES: Record<Degree, string> = {
  A1: "B.E. Chemical",
  A2: "B.E. Civil",
  A3: "B.E. Electrical & Electronics",
  A4: "B.E. Mechanical",
  A5: "B. Pharmacy",
  A7: "B.E. Computer Science",
  A8: "B.E. Electronics & Instrumentation",
  AA: "B.E. Electronics & Communication",
  AD: "B.E. Mathematics & Computing",
  AJ: "B.E. Environmental and Sustainability",
  B1: "M.Sc. Biology",
  B2: "M.Sc. Chemistry",
  B3: "M.Sc. Economics",
  B4: "M.Sc. Mathematics",
  B5: "M.Sc. Physics",
  B7: "M.Sc. Semiconductor and Nanoscience",
};

const FIRST_SINGLE = [
  ...approvedBEDegreeList,
  ...approvedBPharmDegreeList,
].sort();
const SECOND_SINGLE = approvedBEDegreeList;
const DUAL = approvedMScDegreeList;

function DegreeGroup({
  label,
  codes,
  children,
}: {
  label: string;
  codes: readonly Degree[];
  children?: React.ReactNode;
}) {
  return (
    <SelectGroup>
      <SelectLabel>{label}</SelectLabel>
      {children}
      {codes.map((code) => (
        <SelectItem key={code} value={code}>
          {`${code}: ${DEGREES[code]}`}
        </SelectItem>
      ))}
    </SelectGroup>
  );
}

const DegreeDropDown = ({
  firstDegree,
  secondDegree,
  setFirstDegree,
  setSecondDegree,
  year,
  showLabels = false,
}: {
  firstDegree: string | null;
  secondDegree: string | null;
  setFirstDegree: React.Dispatch<React.SetStateAction<string | null>>;
  setSecondDegree: React.Dispatch<React.SetStateAction<string | null>>;
  year: number | undefined;
  showLabels?: boolean;
}) => {
  const firstId = useId();
  const secondId = useId();
  const showSecond =
    firstDegree?.includes("B") && (year === undefined || year >= 2);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        {showLabels && <Label htmlFor={firstId}>First degree</Label>}
        <Select onValueChange={setFirstDegree} value={firstDegree ?? undefined}>
          <SelectTrigger
            id={firstId}
            aria-label={showLabels ? undefined : "First degree"}
            className="w-full"
          >
            <SelectValue placeholder="Select a degree" />
          </SelectTrigger>
          <SelectContent>
            <DegreeGroup label="Single Degrees" codes={FIRST_SINGLE} />
            <DegreeGroup label="Dual Degrees" codes={DUAL} />
          </SelectContent>
        </Select>
      </div>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-(--d-2) ease-(--e-out)",
          showSecond
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0",
        )}
        inert={!showSecond}
        aria-hidden={!showSecond}
      >
        <div className="min-h-0 overflow-hidden -m-1 p-1">
          <div className="flex flex-col gap-1.5">
            {showLabels && <Label htmlFor={secondId}>Second degree</Label>}
            <Select
              onValueChange={setSecondDegree}
              value={secondDegree ?? undefined}
            >
              <SelectTrigger
                id={secondId}
                aria-label={showLabels ? undefined : "Second degree"}
                className="w-full"
              >
                <SelectValue placeholder="Select a degree" />
              </SelectTrigger>
              <SelectContent>
                <DegreeGroup label="Single Degrees" codes={SECOND_SINGLE}>
                  {/* A0 marks single-degree M.Sc., since "" means no selection */}
                  <SelectItem value="A0">None (Single degree M.Sc.)</SelectItem>
                </DegreeGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DegreeDropDown;
