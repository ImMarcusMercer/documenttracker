import { Check } from "lucide-react";

const statusOrder = {
  "Pending Receipt": 0,
  "Forwarded": 1,
  "Received": 2,
  "Checking": 2,
  "For Signature": 3,
  "Signed": 4,
  "For Release": 5,
  "Released": 6,
  "Returned": -1,
};

export default function ProgressTracker({ status, document }) {
  const currentIndex = statusOrder[status] ?? 0;
  const isReturned = status === "Returned";
  const steps = getFlowSteps(document);
  const isTrackingComplete = !isReturned && currentIndex >= steps.length - 1;

  return (
    <div className="w-full">
      {isReturned && (
        <div className="mb-4 px-4 py-3 bg-green-50 border-2 border-green-200 rounded-xl text-green-700 font-semibold text-base text-center">
          ✅ Document was returned for update — Please check remarks for details
        </div>
      )}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = isTrackingComplete ? currentIndex >= index : currentIndex > index;
          const isCurrent = !isTrackingComplete && currentIndex === index && !isReturned;

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-initial">
              {/* Step circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                    isCompleted
                      ? "bg-green-500 border-green-500 text-white"
                      : isCurrent
                      ? "bg-white border-green-500 text-green-700 scale-110"
                      : "bg-muted border-border text-muted-foreground"
                  }`}
                >
                  {isCompleted ? <Check className="w-5 h-5" /> : index + 1}
                </div>
                <span
                  className={`mt-2 text-xs font-semibold text-center max-w-[80px] ${
                    isCurrent ? "text-green-700" : isCompleted ? "text-green-600" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 rounded-full ${
                    isTrackingComplete || currentIndex > index ? "bg-green-500" : "bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getFlowSteps(document) {
  const section = document?.section?.toUpperCase();
  const classification = document?.classification;

  const destinationLabel =
    classification === "Commu Letter"
      ? "For Records"
      : section === "MOBILIZATION"
      ? "For Mobilization Release"
      : "For Releasing";

  return [
    { label: "Pending Receipt", key: "Pending Receipt" },
    { label: "Forwarded to Section", key: "Forwarded" },
    { label: "Received by Handler", key: "Received" },
    { label: "For Mayor/OIC", key: "For Signature" },
    { label: "Signed", key: "Signed" },
    { label: destinationLabel, key: "For Release" },
    { label: "Released", key: "Released" },
  ];
}
